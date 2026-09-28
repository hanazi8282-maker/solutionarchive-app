#!/usr/bin/env node
// 리서처용 VOC 내보내기 — 관련성 판정이 relevant 인 리뷰를 프로젝트별 파일로 뽑는다.
// 설계: reports/2026-09-28/researcher-voc-input-plan.md §1·§3
//
//   node --env-file=.env.local scripts/voc-export.mjs          # ops/state/voc-inputs/ 에 쓴다
//   node --env-file=.env.local scripts/voc-export.mjs --dry    # 파일을 쓰지 않고 요약만
//
// 왜 파일인가: 리서처(sa-cmo-researcher)는 DB 자격증명이 없다(CLAUDE.md §10.1, cmo-daily.mjs buildAgentEnv).
//   그래서 오케스트레이터가 조사 직전에 이 스크립트를 돌려 파일로 건네고, 리서처는 Read 만 한다.
//   출력:
//     ops/state/voc-inputs/index.md            프로젝트 1줄씩 (id · URL · 시장 · 모델 · 병목 · 건수)
//     ops/state/voc-inputs/<project_id>.json   그 프로젝트의 VOC 목록 (input_id · text · labels …)
//
// ⛔ DB 를 **읽기만** 한다. 쓰기 0줄.
// ⛔ 출력 폴더는 .gitignore 에 있다 — 리뷰 원문이라 공개 리포에 올리지 않는다. 30일 purge 대상 데이터다.
//    작성자 정보는 애초에 컬럼이 없고, source_key(소스별 식별자·URL 조각)는 내보내지 않는다.
//
// 종료 코드: 0 = 썼다(0건이어도 조회가 정상이면 0 — index.md 에 "0건" 이 적힌다)
//           2 = 확인 불가(자격증명 없음·테이블 없음·조회 실패). 파일을 쓰지 않고, 있던 파일도 지운다 —
//               지난 실행의 파일을 오늘 것으로 읽게 두면 §7.1 위반이다.

import fs from 'node:fs'
import path from 'node:path'

export const OUT_DIR = path.join('ops', 'state', 'voc-inputs')
export const INDEX_FILE = path.join(OUT_DIR, 'index.md')
/** 프로젝트당 상한. 리서처 컨텍스트와 파일 크기를 같이 지킨다. 실측 뒤 조정. */
export const PER_PROJECT_CAP = 30
/** 본문 절단 길이. 무브 주장과 맞는지 보는 데는 충분하고, 원문 전문을 옮기지 않는다. */
export const TEXT_MAX = 400

// ────────────────────────────────────────────────────────────
// 순수 함수 — 셀프테스트: scripts/voc-export-selftest.mjs
// ────────────────────────────────────────────────────────────

/**
 * 판정의 정본값. 사람 판정이 있으면 그것, 없으면 LLM 판정(review_relevance_verdicts 규칙).
 * 'unknown' 은 확인 불가이지 무관이 아니다 — 하지만 재료로는 쓰지 않는다(무관과 같은 취급이 아니라 "아직 아님").
 */
export function effectiveVerdict(row) {
  return row.human_verdict ?? row.verdict ?? 'unknown'
}

/** 누가 relevant 라 했나. 리서처가 신뢰도를 가늠하는 표시일 뿐 포함 조건은 아니다. */
export function verdictBy(row) {
  if (row.human_verdict === 'relevant') return 'human'
  if (row.auto_approved_at) return 'auto'
  return 'llm'
}

const IMPACT_ORDER = { high: 0, mid: 1, low: 2 }

/** 본문 절단. 절단됐으면 말줄임을 붙여 "여기까지가 전부" 로 읽히지 않게 한다. */
export function clipText(s, max = TEXT_MAX) {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max)}…` : t
}

/**
 * 판정 행(analysis_inputs 임베드 포함) → 프로젝트별 VOC 묶음.
 *
 * 포함: coalesce(human_verdict, verdict) = 'relevant' ∧ raw_text 있음 ∧ source_type = 'review'.
 * 정렬: impact high→mid→low→NULL, 그다음 collected_at 최신. 상한 cap.
 * 반환: Map<project_id, { items: [...], total }> — total 은 상한 전 건수(리서처가 "더 있다" 를 안다).
 */
export function groupVoc(rows, { cap = PER_PROJECT_CAP, textMax = TEXT_MAX } = {}) {
  const by = new Map()
  for (const r of rows ?? []) {
    if (effectiveVerdict(r) !== 'relevant') continue
    const inp = r.analysis_inputs
    if (!inp || !inp.raw_text) continue            // purge 됐거나 임베드 실패 — 재료 아님
    if (inp.source_type && inp.source_type !== 'review') continue
    if (!r.project_id || !r.input_id) continue
    const g = by.get(r.project_id) ?? { items: [], total: 0 }
    g.total++
    g.items.push({
      input_id: r.input_id,
      text: clipText(inp.raw_text, textMax),
      labels: {
        impact: r.impact ?? null,
        frequency: r.frequency ?? null,
        community_signal: r.community_signal ?? null,
        wtp_mentioned: r.wtp_mentioned ?? null,
      },
      verdict_by: verdictBy(r),
      collected_at: inp.collected_at ?? null,
    })
    by.set(r.project_id, g)
  }
  for (const g of by.values()) {
    g.items.sort((a, b) =>
      (IMPACT_ORDER[a.labels.impact] ?? 3) - (IMPACT_ORDER[b.labels.impact] ?? 3)
      || String(b.collected_at ?? '').localeCompare(String(a.collected_at ?? '')))
    g.items = g.items.slice(0, cap)
  }
  return by
}

/**
 * index.md 본문. `projects` 는 { id, competitor_url, market, business_model, bottleneck, pitch, count, total } 배열.
 * 0건이면 본문에 "0건" 을 명시한다 — 파일 없음(확인 불가)과 구분되게(§7.1).
 */
export function renderIndex(projects, { generatedAt, labels = 'present' } = {}) {
  const L = [
    `# 리서처용 VOC 색인 — ${generatedAt ?? ''}`.trimEnd(),
    '',
    '관련성 판정이 relevant(사람 판정 우선) 인 리뷰를 프로젝트별로 모았다. **참고 재료다 — 근거(evidence)가 아니다.**',
    '맡은 브랜드와 맞는 프로젝트가 있으면 `ops/state/voc-inputs/<project_id>.json` 을 Read 하고,',
    '무브의 주장을 실제로 받치는 목소리만 `moves[i].voc_inputs` 에 **input_id 로만** 적는다. 원문을 초안·노트에 옮기지 않는다.',
    labels === 'absent' ? '(라벨 impact/frequency 등은 이 DB 에 아직 없다 — 전부 null 이다. 마이그 20260930000014 미적용.)' : '',
    '',
  ]
  if (!projects.length) {
    L.push('**0건** — relevant 판정이 있는 프로젝트가 없다. 조회는 정상이었다(파일이 없는 것과 다르다). VOC 없이 조사한다.')
    return L.filter((s, i) => s !== '' || L[i - 1] !== '').join('\n') + '\n'
  }
  L.push(`프로젝트 ${projects.length}곳 · VOC ${projects.reduce((n, p) => n + p.count, 0)}건(상한 전 ${projects.reduce((n, p) => n + p.total, 0)}건).`, '')
  for (const p of projects) {
    L.push(`- \`${p.id}\` · ${p.competitor_url ?? '(URL 없음)'} · ${p.market ?? '시장 미지정'} · ${p.business_model ?? '모델 미지정'} · ${p.bottleneck ?? '병목 미지정'} · VOC ${p.count}건${p.total > p.count ? ` (전체 ${p.total})` : ''}`)
    if (p.pitch) L.push(`  - ${clipText(p.pitch, 120)}`)
  }
  return L.filter((s, i) => s !== '' || L[i - 1] !== '').join('\n') + '\n'
}

// ────────────────────────────────────────────────────────────
// 실행부 — 여기서만 DB·파일시스템을 만진다
// ────────────────────────────────────────────────────────────

const MISSING_COLUMN = new Set(['42703', 'PGRST204'])
const MISSING_TABLE = /42P01|PGRST205/
const PAGE = 1000  // PostgREST 기본 상한. 넘기면 조용히 잘린다 — range 로 끝까지 읽는다.

const BASE_COLS = 'input_id, project_id, verdict, human_verdict'
const EXTRA_COLS = ', auto_approved_at, impact, frequency, community_signal, wtp_mentioned'
const EMBED = ', analysis_inputs!inner(raw_text, source_type, collected_at)'

/** relevant 판정 전량. `{ rows, labels }` 또는 `{ error }`. 라벨·자동승인 컬럼 미적용이면 그것 없이 다시 읽는다. */
export async function fetchRelevantRows(sb) {
  let labels = 'present'
  const readAll = async (cols) => {
    const rows = []
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await sb
        .from('review_relevance_verdicts')
        .select(cols + EMBED)
        .or('human_verdict.eq.relevant,and(human_verdict.is.null,verdict.eq.relevant)')
        .is('analysis_inputs.purged_at', null)
        .range(from, from + PAGE - 1)
      if (error) return { error }
      rows.push(...(data ?? []))
      if (!data || data.length < PAGE) break
    }
    return { rows }
  }
  let r = await readAll(BASE_COLS + EXTRA_COLS)
  if (r.error && (MISSING_COLUMN.has(r.error.code ?? '') || /auto_approved_at|impact|frequency|community_signal|wtp_mentioned/.test(r.error.message ?? ''))) {
    labels = 'absent'
    r = await readAll(BASE_COLS)
  }
  if (r.error) return { error: `${r.error.code ?? ''} ${r.error.message}`.trim() }
  return { rows: r.rows, labels }
}

async function main() {
  const dry = process.argv.includes('--dry')
  const { createClient } = await import('../lib/supabase/server.ts')
  const sb = await createClient()
  const unavailable = (why) => {
    console.error(`voc-export: 확인 불가 — ${why}`)
    // 지난 실행의 파일이 오늘 것으로 읽히지 않게 지운다. 프롬프트는 index.md 가 없으면 VOC 줄을 넣지 않는다.
    if (!dry) fs.rmSync(OUT_DIR, { recursive: true, force: true })
    process.exit(2)
  }
  if (!sb) unavailable('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정')

  const res = await fetchRelevantRows(sb)
  if (res.error) unavailable(MISSING_TABLE.test(res.error) ? `review_relevance_verdicts 없음(마이그 20260929000002 미적용) — ${res.error}` : res.error)

  const grouped = groupVoc(res.rows)
  const ids = [...grouped.keys()]
  let meta = new Map()
  if (ids.length) {
    const { data, error } = await sb.from('analysis_projects')
      .select('id, competitor_url, market, business_model, bottleneck, product_elevator_pitch')
      .in('id', ids)
    if (error) unavailable(`analysis_projects 조회 실패 — ${error.code ?? ''} ${error.message}`)
    meta = new Map((data ?? []).map((p) => [p.id, p]))
  }
  const projects = ids.map((id) => {
    const p = meta.get(id) ?? {}
    const g = grouped.get(id)
    return { id, competitor_url: p.competitor_url ?? null, market: p.market ?? null, business_model: p.business_model ?? null, bottleneck: p.bottleneck ?? null, pitch: p.product_elevator_pitch ?? null, count: g.items.length, total: g.total }
  }).sort((a, b) => b.count - a.count || a.id.localeCompare(b.id))

  const generatedAt = new Date().toISOString()
  const index = renderIndex(projects, { generatedAt, labels: res.labels })
  const total = projects.reduce((n, p) => n + p.count, 0)
  console.log(`voc-export: projects=${projects.length} inputs=${total} labels=${res.labels}${dry ? ' (--dry, 파일 안 씀)' : ''}`)
  if (dry) { console.log(index); return }

  fs.rmSync(OUT_DIR, { recursive: true, force: true })
  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.writeFileSync(INDEX_FILE, index, 'utf-8')
  for (const p of projects) {
    fs.writeFileSync(path.join(OUT_DIR, `${p.id}.json`), JSON.stringify({
      project_id: p.id, competitor_url: p.competitor_url, market: p.market, business_model: p.business_model,
      bottleneck: p.bottleneck, generated_at: generatedAt, total: p.total, items: grouped.get(p.id).items,
    }, null, 2) + '\n', 'utf-8')
  }
  console.log(`썼다: ${INDEX_FILE} + ${projects.length}개 json`)
}

// 셀프테스트가 순수 함수만 가져다 쓸 수 있어야 한다 — import 만으로 DB 를 부르지 않는다.
if (process.argv[1] && process.argv[1].endsWith('voc-export.mjs')) {
  main().catch((e) => { console.error(e); process.exit(2) })
}
