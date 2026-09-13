#!/usr/bin/env node
// PMF 2축 진단기 (CTO 엔진 b).
//
//   node --env-file=.env.local scripts/pmf-assess.mjs --input ops/pmf/<이름>.json [--dry]
//   node --env-file=.env.local scripts/pmf-assess.mjs --example        (입력 양식만 찍는다)
//
// 종료 코드: 0 matched / 1 no_match(음성) / 2 not_run(확인 불가)
//   ★ 1 과 2 를 반드시 나눈다. "선례가 없다"와 "못 찾아봤다"는 다른 사건이고
//     다음 행동이 정반대다 (case-match.mjs 와 같은 규약).
//
// ⚠️ 단일 점수를 만들지 않는다.
//    수요축과 선례축은 출처가 다르고(우리 리뷰 데이터 vs 남의 사례) 틀리는 방식도
//    다르다. 한 숫자로 곱하면 "선례가 없어서 낮음"과 "수요가 없어서 낮음"이 같은
//    값이 되는데, 전자는 "직접 검증하라"이고 후자는 "손대지 마라"다. 화면이 같아지면
//    정반대 행동이 같은 근거를 갖게 된다. `pmf_assessments` 에 pmf_score 컬럼이
//    없는 것도 같은 이유다.
//
// ⚠️ 산식을 여기서 다시 만들지 않는다.
//    demandAxis / precedentAxis / quadrantOf 는 lib/cases/match.ts 한 벌뿐이다.
//    두 벌이 되는 순간 화면과 스크립트의 값이 갈라지고, 어느 쪽이 맞는지 아무도 모른다.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '../lib/supabase/server.ts'
import { matchMoves, demandAxis, precedentAxis, quadrantOf } from '../lib/cases/match.ts'
import {
  BUSINESS_MODEL, BUYER_TYPE, PURCHASE_FREQUENCY, PRICE_BAND, BOTTLENECK,
} from '../lib/cases/draft.ts'
import { recordStatusLog } from './notion-status-log.mjs'

const VOCAB = {
  business_model: BUSINESS_MODEL,
  buyer_type: BUYER_TYPE,
  purchase_frequency: PURCHASE_FREQUENCY,
  price_band: PRICE_BAND,
  bottleneck: BOTTLENECK,
}

export const EXAMPLE_INPUT = {
  item: '두피 각질용 저자극 샴푸',
  market: '탈모·두피 케어',
  bottleneck: 'TRUST',
  price_band: 'MID',
  buyer_type: 'B2C',
  business_model: 'D2C',
  purchase_frequency: 'REPEAT',
  target_project_id: null,
  created_by: 'cto',
}

/**
 * 사람이 쓴 입력을 케이스 어휘로 정규화한다.
 *
 * ★ 어휘 밖 값을 **가장 가까운 값으로 밀어 넣지 않는다.** 비운다.
 *   밀어 넣으면 매칭 결과가 입력과 다른 전제 위에서 나오는데, 화면에서는
 *   구분이 안 된다. 비우면 그 축의 패싯 가점만 못 받을 뿐 결과가 왜곡되지 않는다.
 *   무엇을 왜 비웠는지는 notes 로 올려 보고에 찍는다.
 */
export function normalizeFacets(input) {
  const facets = {}
  const notes = []
  for (const [k, vocab] of Object.entries(VOCAB)) {
    const raw = input?.[k]
    if (raw === undefined || raw === null || raw === '') { facets[k] = null; continue }
    const up = String(raw).trim().toUpperCase()
    if (vocab.includes(up)) { facets[k] = up; continue }
    facets[k] = null
    notes.push(`${k}="${raw}" 는 어휘 밖이라 비웠다 (허용: ${vocab.join('/')})`)
  }
  return { facets, notes }
}

/**
 * 진단 1건 → Notion "일일 상태 로그" CTO 행 입력 (CLAUDE.md §11).
 * 두 축 값과 각 축의 근거 문장을 같이 싣는다(CTO 헌장 산출물 규격). 단일 점수를 만들지 않는다.
 * 사람판단필요는 항상 true — 진단은 사람의 진입 판단 입력이다.
 * 날짜는 KST 오늘 — 수동 CLI 라 예정 크론이 없다(§11 제목 규칙).
 */
export function buildPmfEntry({ input = {}, match = null, demand = null, precedent = null, quad = null, savedId = null, errors = [], inputPath = null, now = new Date() }) {
  const axis = (name, a) => (a
    ? `${name} ${a.value === null || a.value === undefined ? '확인 불가' : Number(a.value).toFixed(3)} — ${a.reason}`
    : null)
  const done = [
    `PMF 진단 — ${input?.item ?? '(아이템 미기재)'}${input?.market ? ` · ${input.market}` : ''}`,
    match ? `매칭 ${match.status} — ${match.reason}` : '진단을 끝내지 못했다 (매칭 전 중단)',
    axis('수요축', demand),
    axis('선례축', precedent),
    quad ? `사분면 ${quad.quadrant ?? '내지 않음'} — ${quad.reason}` : null,
  ].filter(Boolean)
  const blocked = [
    ...errors,
    demand && demand.value === null ? `수요축 확인 불가 — ${demand.reason}` : null,
    precedent && precedent.value === null ? `선례축 확인 불가 — ${precedent.reason}` : null,
  ].filter(Boolean).slice(0, 5)
  const next = errors.length ? '오류 해소 후 같은 입력으로 재진단'
    : !match || match.status === 'not_run' ? '선례 매칭 확인 불가 원인 해소 후 재진단'
      : quad?.quadrant ? `사분면 ${quad.quadrant} 기준으로 진입 여부 판단 (두 축 근거 확인)`
        : match.status === 'no_match' ? '선례 없음 — 직접 검증(소규모 테스트)을 설계할지 판단'
          : '한 축이 확인 불가라 사분면 없음 — 빠진 축을 채운 뒤 판단'
  return {
    date: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(now),
    track: 'CTO',
    done: done.join('\n'),
    blocked: blocked.length ? blocked.join('\n') : '없음',
    next,
    needsHuman: true,
    note: `pmf-assess.mjs · assessment ${savedId ?? '저장 안 됨'}${inputPath ? ` · 입력 ${inputPath}` : ''}`,
  }
}

function isMain() {
  if (!process.argv[1]) return false
  try { return path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url)) }
  catch { return false }
}

if (isMain()) {
  const argv = process.argv.slice(2)
  const opt = (n, d = null) => {
    const i = argv.indexOf(`--${n}`)
    return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : d
  }
  const dry = argv.includes('--dry')

  if (argv.includes('--example')) {
    console.log(JSON.stringify(EXAMPLE_INPUT, null, 2))
    process.exit(0)
  }

  const inputPath = opt('input')
  if (!inputPath) {
    console.error('사용: --input <json경로> [--dry]   (양식: --example)')
    process.exit(2)
  }
  if (!fs.existsSync(inputPath)) {
    console.error(`⚠️ 확인 불가: 입력 파일이 없다 — ${inputPath}`)
    process.exit(2)
  }

  let input
  try { input = JSON.parse(fs.readFileSync(inputPath, 'utf-8')) }
  catch (e) { console.error(`⚠️ 확인 불가: 입력 JSON 파싱 실패 — ${e.message}`); process.exit(2) }

  const { facets, notes } = normalizeFacets(input)
  for (const n of notes) console.log(`⚠️ ${n}`)

  // ── Notion 일일 상태 로그 (CTO 트랙, CLAUDE.md §11) ─────────────
  // 진단을 시작한 뒤의 모든 종료는 finish() 를 지난다. 로컬에는 NOTION_API_TOKEN 이 없어
  // ops/state/status-log-pending/<제목>.md 폴백으로 떨어진다 — 그 사실을 출력한다.
  // 종료 코드 규약(0 matched / 1 no_match / 2 not_run)은 기록 성패와 무관하게 그대로다.
  // dry 는 쓰지 않는다(반영 없는 실행).
  let match = null
  let demand = null
  let precedent = null
  let quad = null
  let savedId = null
  async function finish(code, errors = []) {
    const r = await recordStatusLog(
      buildPmfEntry({ input, match, demand, precedent, quad, savedId, errors, inputPath }),
      { pendingDir: path.join(process.cwd(), 'ops', 'state', 'status-log-pending') },
    )
    if (r.ok) console.log(`✅ 일일 상태 로그(CTO) ${r.title} 기록·재확인`)
    else if (r.pendingPath) console.log(`⚠️ 일일 상태 로그를 Notion 에 못 썼다(${r.stage}: ${r.error}) → ${path.relative(process.cwd(), r.pendingPath)} 에 남겼다. 다음 세션이 올린다 (CLAUDE.md §11)`)
    else console.error(`⚠️ 일일 상태 로그 기록 실패 — ${r.stage}: ${r.error}${r.pendingError ? ` · 폴백 파일도 실패: ${r.pendingError}` : ''}${r.pageId ? ` (페이지는 생성됨 ${r.pageId})` : ''}`)
    process.exit(code)
  }

  let supabase
  try { supabase = await createClient() }
  catch (e) { console.error(`⚠️ 확인 불가: Supabase 클라이언트 생성 실패 — ${e.message}`); await finish(2, [`Supabase 클라이언트 생성 실패 — ${e.message}`]) }
  if (!supabase) {
    console.error('⚠️ 확인 불가: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정')
    await finish(2, ['Supabase 자격증명 미설정 — 진단 불가'])
  }

  // 조회 실패는 null. 빈 배열과 섞지 않는다 — 섞는 순간 matchMoves 가
  // "확인 불가"를 "선례 없음"으로 접는다.
  async function q(table, select, filter) {
    let query = supabase.from(table).select(select)
    if (filter) query = filter(query)
    const { data, error } = await query
    if (error) {
      console.error(`⚠️ ${table} 조회 실패 — ${error.code ?? ''} ${error.message}`)
      if (['42P01', 'PGRST205'].includes(error.code)) {
        console.error('   관련 마이그레이션 미적용일 수 있다. 사람이 `supabase db query --linked -f` 로 적용한다 (§12-5).')
      }
      return null
    }
    return data
  }

  const studies = await q('case_studies',
    'id,slug,brand_name,bottleneck,business_model,buyer_type,price_band,outcome_status,review_status')
  const moves = await q('case_moves',
    'id,case_study_id,lever,claim,evidence_grade,outcome_direction,review_status,metric_name,metric_before,metric_after,metric_unit')

  match = matchMoves(facets.bottleneck, studies, moves, null, facets)

  // ── 수요축 ────────────────────────────────────────────────
  const projectId = input.target_project_id ?? null
  demand = { value: null, reason: '분석 프로젝트를 지정하지 않았다 — 수요축 확인 불가(0 이 아니다)' }
  if (projectId) {
    const aspects = await q('analysis_aspects', 'opportunity_score', (qq) => qq.eq('project_id', projectId))
    demand = demandAxis(aspects === null ? null : aspects.map((a) => a.opportunity_score))
  }

  precedent = precedentAxis(match)
  quad = quadrantOf(demand.value, precedent.value)

  // ── 보고 (넓은 표 금지, 항목당 한 줄) ─────────────────────
  console.log(`\n# PMF 진단 — ${input.item ?? '(아이템 미기재)'}${input.market ? ` · ${input.market}` : ''}`)
  console.log(`- 패싯: ${Object.entries(facets).map(([k, v]) => `${k}=${v ?? '—'}`).join(' · ')}`)
  console.log(`- 매칭: ${match.status} — ${match.reason}`)
  console.log(`- 수요축: ${demand.value === null ? '확인 불가' : demand.value.toFixed(3)} — ${demand.reason}`)
  console.log(`- 선례축: ${precedent.value === null ? '확인 불가' : precedent.value.toFixed(3)} — ${precedent.reason}`)
  console.log(`- 사분면: ${quad.quadrant ?? '내지 않음'} — ${quad.reason}`)
  console.log(`- 제외: 자기 ${match.excluded.self} · 미승인 ${match.excluded.not_approved} · 등급D ${match.excluded.grade_d}`)

  if (match.moves.length) {
    console.log('\n## 인용 선례')
    for (const m of match.moves.slice(0, 10)) {
      console.log(`- [${m.evidence_grade}] ${m.study.brand_name} · ${m.lever} (${m.outcome_direction}) — ${m.claim.slice(0, 80)}`)
    }
  }

  // ── 저장 ──────────────────────────────────────────────────
  //
  // not_run 이면 축·사분면을 전부 NULL 로 넣는다. DB CHECK 도 같은 걸 강제하지만
  // 여기서 먼저 지운다 — 제약에 걸려 저장이 통째로 실패하면 진단 기록 자체가 사라진다.
  const notRun = match.status === 'not_run'
  const row = {
    input,
    facets,
    target_project_id: projectId,
    demand_axis: notRun ? null : demand.value,
    precedent_axis: notRun ? null : precedent.value,
    quadrant: notRun ? null : quad.quadrant,
    match_status: match.status,
    match_reason: match.reason,
    created_by: input.created_by ?? 'pmf-assess.mjs',
  }

  if (dry) {
    console.log('\n(dry) DB 에 쓰지 않았다. 일일 상태 로그도 남기지 않는다.')
    process.exit(match.status === 'matched' ? 0 : match.status === 'no_match' ? 1 : 2)
  }

  const ins = await supabase.from('pmf_assessments').insert(row).select('id').single()
  if (ins.error) {
    console.error(`\n⚠️ 확인 불가: pmf_assessments 저장 실패 — ${ins.error.code ?? ''} ${ins.error.message}`)
    if (['42P01', 'PGRST205'].includes(ins.error.code)) {
      console.error('   마이그레이션 20260908000003_pmf_assessments.sql 미적용이다. 사람이 적용한다 (§12-5).')
    }
    await finish(2, [`pmf_assessments 저장 실패 — ${ins.error.code ?? ''} ${ins.error.message}`])
  }
  savedId = ins.data.id
  console.log(`\n✅ pmf_assessments ${ins.data.id} 저장 (match_status=${match.status})`)

  if (match.moves.length) {
    const moveRows = match.moves.slice(0, 20).map((m) => ({
      assessment_id: ins.data.id,
      case_move_id: m.id,
      match_score: m.match_score,
      match_reason: m.facet_hits.length ? `패싯일치 ${m.facet_hits.join('/')}` : '병목 일치',
      matched_by: 'facet',
    }))
    const mr = await supabase.from('pmf_assessment_moves').insert(moveRows)
    if (mr.error) {
      // 진단 본체는 저장됐다. 근거 연결만 실패했다 — 그 사실을 감추지 않는다.
      console.error(`⚠️ 인용 무브 연결 실패 — ${mr.error.code ?? ''} ${mr.error.message}`)
      console.error('   진단 행은 남았지만 근거 추적이 끊긴 상태다. 무브가 강등돼도 감지되지 않는다.')
      await finish(2, [`인용 무브 연결 실패 — ${mr.error.code ?? ''} ${mr.error.message} (진단 행은 저장됨)`])
    }
    console.log(`✅ pmf_assessment_moves ${moveRows.length}행 연결`)
  }

  await finish(match.status === 'matched' ? 0 : match.status === 'no_match' ? 1 : 2)
}
