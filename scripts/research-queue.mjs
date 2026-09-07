#!/usr/bin/env node
// 조사 대기열 관리 — 무엇을 왜 조사할지 **미리** 정한다.
//
// 왜 이 스크립트가 필요한가 (에이전트에게 "알아서 골라"를 안 시키는 이유)
//   1) 중복. 어제 뭘 조사했는지 모르는 에이전트는 같은 브랜드를 또 판다.
//   2) 생존 편향. 웹서치는 성공 사례로 쏠린다. "실패 사례도 봐라"를 프롬프트에
//      적어 두면 안 지켜진다. 그래서 **할당량을 로직으로 강제한다** —
//      --plan N 의 결과에 reason='failure_quota' 가 1건 이상 없으면 이 스크립트는
//      아무것도 쓰지 않고 exit 1 로 죽는다. 가이드가 아니라 게이트다.
//
// ⚠️ 조사 전에는 브랜드가 정해지지 않는 슬롯이 정상이다.
//    커버리지 갭을 메우는 조사는 "이 병목의 사례를 찾아라"이지 "이 브랜드를
//    조사하라"가 아니다. 그럴 때 brand_name 에 그럴듯한 브랜드를 지어 넣지
//    않는다 — 그건 근거 없는 값을 큐에 심는 것이다. `미정 (...)` 슬롯으로 두고
//    실제 대상은 조사원이 WebSearch 로 정한 뒤 case_studies.slug 가 중복을 막는다.
//
// 사용:
//   node --env-file=.env.local scripts/research-queue.mjs --plan 2 [--dry]
//   node --env-file=.env.local scripts/research-queue.mjs --list
//   node --env-file=.env.local scripts/research-queue.mjs --claim 2 [--run-id <uuid>]
//   node --env-file=.env.local scripts/research-queue.mjs --resolve <id> --status done|failed|skipped [--notes ...]
//   node --env-file=.env.local scripts/research-queue.mjs --add --brand "Notion" --reason manual
//
// 종료 코드: 0 정상 / 1 음성(계획을 세울 수 없다 — 예: failure_quota 미충족) / 2 확인 불가

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { matchMoves } from '../lib/cases/match.ts'

export const BOTTLENECKS = ['AWARENESS', 'TRUST', 'CONVERSION', 'RETENTION',
  'UNIT_ECONOMICS', 'DISTRIBUTION', 'SUPPLY']

export const REASONS = ['coverage_gap', 'ceo_feedback', 'pattern_candidate', 'failure_quota', 'manual']

export const FEEDBACK_DIR = path.join(process.cwd(), 'reports', 'feedback')

/** 매칭이 성립하는 최소선. 서로 다른 케이스 2곳이 필요하다(1곳은 절반이 아니라 불가다). */
export const PAIRABLE_MIN = 2

// ────────────────────────────────────────────────────────────
// 피드백 파일 — reports/feedback/*.md 프론트매터
// ────────────────────────────────────────────────────────────
//
// 인제스트해도 **파일을 지우지 않는다.** status 만 open → ingested 로 바꾼다.
// 지우면 "CEO 가 무엇을 요청했었나"의 기록이 사라지고, 같은 요청이 반복될 때
// 이전에 어떻게 처리했는지 되짚을 방법이 없다.

/** `---` 블록의 `key: value` 만 읽는다. YAML 전체를 파싱하지 않는다(의존성 없음). */
export function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!m) return { data: null, body: text, raw: null }
  const data = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec(line.trim())
    if (kv) data[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, '')
  }
  return { data, body: text.slice(m[0].length), raw: m[0] }
}

/** status 값만 바꿔 되돌려준다. 다른 줄은 건드리지 않는다. */
export function setFrontmatterStatus(text, next) {
  const { data } = parseFrontmatter(text)
  if (!data) return text
  if (/^status\s*:/m.test(text)) return text.replace(/^status\s*:.*$/m, `status: ${next}`)
  return text.replace(/^---\r?\n/, `---\nstatus: ${next}\n`)
}

export function readOpenFeedback(dir = FEEDBACK_DIR) {
  if (!fs.existsSync(dir)) return []
  const out = []
  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith('.md') || f.startsWith('_')) continue
    const p = path.join(dir, f)
    const text = fs.readFileSync(p, 'utf-8')
    const { data } = parseFrontmatter(text)
    if (!data || (data.status ?? 'open') !== 'open') continue
    out.push({
      file: p,
      brand: data.brand ?? null,
      market: data.market ?? null,
      bottleneck: BOTTLENECKS.includes(data.bottleneck) ? data.bottleneck : null,
      slug_hint: data.slug_hint ?? null,
      note: data.note ?? null,
    })
  }
  return out
}

// ────────────────────────────────────────────────────────────
// 계획 수립 — 순수 함수. DB 없이 셀프테스트가 돈다.
// ────────────────────────────────────────────────────────────

/**
 * 병목별 커버리지에서 갭을 뽑는다. 케이스 2곳 미만이면 갭이다.
 * `studies`/`moves` 가 null 이면 갭을 계산하지 않고 null 을 돌려준다 —
 * "갭 0개"와 "확인 불가"를 절대 섞지 않는다.
 */
export function coverageGaps(studies, moves) {
  if (!studies || !moves) return null
  return BOTTLENECKS
    .map((b) => ({ bottleneck: b, cases: new Set(matchMoves(b, studies, moves).moves.map((m) => m.study.id)).size }))
    .filter((g) => g.cases < PAIRABLE_MIN)
    .sort((a, b) => a.cases - b.cases || a.bottleneck.localeCompare(b.bottleneck))
}

const gapSlot = (bottleneck, outcome) => ({
  slug_hint: null,
  brand_name: `미정 (${bottleneck} · ${outcome === 'failure' ? '실패/피벗/철수' : '성공'} 사례)`,
  market: null,
  target_bottleneck: bottleneck,
})

/**
 * N건 계획을 만든다.
 *
 * 순서: failure_quota 1건(맨 앞, 절대 잘리지 않는다) → ceo_feedback → coverage_gap.
 * 앞에 두는 이유는 N 이 작을 때 잘려 나가는 쪽이 실패 할당분이 되면 안 되기 때문이다.
 * 처음엔 뒤에 붙였다가, N=2 에서 피드백 2건이 들어오자 실패 할당이 밀려났다.
 */
export function buildPlan({ n, gaps, feedback = [], excludeBrands = new Set() }) {
  if (!Number.isInteger(n) || n < 1) throw new Error(`--plan 은 1 이상의 정수다: ${n}`)
  if (gaps === null) throw new Error('커버리지 확인 불가 — 계획을 세우지 않는다')

  const rows = []
  const seen = new Set()
  const push = (row) => {
    const key = `${row.reason}|${row.brand_name}`
    if (seen.has(key)) return
    if (excludeBrands.has(row.brand_name)) return
    seen.add(key)
    rows.push(row)
  }

  // 1) 실패 사례 할당분 — 항상 맨 앞. 갭이 있으면 그 병목에서, 없으면 병목 미지정.
  const failBottleneck = gaps.length ? gaps[0].bottleneck : null
  push({
    ...(failBottleneck ? gapSlot(failBottleneck, 'failure') : {
      slug_hint: null, brand_name: '미정 (실패/피벗/철수 사례)', market: null, target_bottleneck: null,
    }),
    reason: 'failure_quota',
    priority: 10,
    notes: '실패·피벗·철수 사례 할당분. 성공 사례로 대체하지 마라 — 웹서치는 성공 쪽으로 쏠린다. '
      + 'outcome_direction=negative 무브가 나오는 게 정상이고, 억지로 교훈을 만들어 positive 로 돌리지 마라.',
  })

  // 2) CEO 피드백 — 사람이 직접 지목한 것. 갭보다 앞선다.
  for (const f of feedback) {
    push({
      slug_hint: f.slug_hint,
      brand_name: f.brand ?? `미정 (${f.bottleneck ?? '병목 미지정'} · CEO 요청)`,
      market: f.market,
      target_bottleneck: f.bottleneck,
      reason: 'ceo_feedback',
      priority: 20,
      notes: [`출처 ${path.basename(f.file)}`, f.note].filter(Boolean).join(' · '),
      _feedbackFile: f.file,
    })
  }

  // 3) 커버리지 갭 — 케이스가 적은 병목부터.
  for (const g of gaps) {
    push({
      ...gapSlot(g.bottleneck, 'any'),
      reason: 'coverage_gap',
      priority: 50 + g.cases,
      notes: `${g.bottleneck} 승인 케이스 ${g.cases}곳 — 매칭 성립에 ${PAIRABLE_MIN}곳이 필요하다`,
    })
  }

  return rows.slice(0, n)
}

/**
 * ★ 할당량 게이트. 계획에 실패 사례가 없으면 통과시키지 않는다.
 * 문서로 적어 둔 규칙은 지켜지지 않는다. 그래서 여기서 막는다.
 */
export function enforceFailureQuota(plan) {
  const n = plan.filter((r) => r.reason === 'failure_quota').length
  return {
    ok: n >= 1,
    count: n,
    reason: n >= 1
      ? `실패 사례 할당 ${n}건 포함`
      : '계획에 failure_quota 가 0건이다 — 성공 사례만 조사하면 아카이브가 생존 편향으로 굳는다',
  }
}

// ────────────────────────────────────────────────────────────
// CLI
// ────────────────────────────────────────────────────────────
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
  const flag = (n) => argv.includes(`--${n}`)
  const dry = flag('dry')

  const { createClient } = await import('../lib/supabase/server.ts')
  let supabase
  try { supabase = await createClient() }
  catch (e) { console.error(`⚠️ 확인 불가: Supabase 클라이언트 생성 실패 — ${e.message}`); process.exit(2) }
  if (!supabase) {
    console.error('⚠️ 확인 불가: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 미설정')
    process.exit(2)
  }

  const missingHint = (code) => (['42P01', 'PGRST205'].includes(code)
    ? ' — 마이그레이션 20260908000002_research_queue.sql 미적용일 수 있다. 사람이 `supabase db query --linked -f` 로 적용한다 (§12-5).'
    : '')

  // ── --list ─────────────────────────────────────────────────
  if (flag('list')) {
    const { data, error } = await supabase.from('research_queue')
      .select('id,brand_name,target_bottleneck,reason,priority,status,notes,created_at')
      .order('status').order('priority').order('created_at')
    if (error) { console.error(`⚠️ 확인 불가: ${error.code ?? ''} ${error.message}${missingHint(error.code)}`); process.exit(2) }
    if (!data.length) { console.log('큐가 비어 있다 (조회는 정상 — "확인 불가"가 아니다)'); process.exit(0) }
    for (const r of data) {
      console.log(`- [${r.status}] ${r.brand_name} · ${r.target_bottleneck ?? '병목미정'} · ${r.reason} · p${r.priority}`)
      if (r.notes) console.log(`    ${r.notes}`)
      console.log(`    id=${r.id}`)
    }
    process.exit(0)
  }

  // ── --add ──────────────────────────────────────────────────
  if (flag('add')) {
    const brand = opt('brand')
    const reason = opt('reason', 'manual')
    if (!brand) { console.error('✗ --brand 가 필요하다'); process.exit(2) }
    if (!REASONS.includes(reason)) { console.error(`✗ --reason 어휘 밖: ${reason} (${REASONS.join('/')})`); process.exit(2) }
    const row = {
      brand_name: brand, market: opt('market'), slug_hint: opt('slug-hint'),
      target_bottleneck: opt('bottleneck'), reason, priority: Number(opt('priority', '100')),
      requested_by: opt('by', 'cli'), notes: opt('notes'),
    }
    if (dry) { console.log('(dry) 추가하지 않음:', JSON.stringify(row)); process.exit(0) }
    const { error } = await supabase.from('research_queue').insert(row)
    if (error) { console.error(`⚠️ 확인 불가: ${error.code ?? ''} ${error.message}${missingHint(error.code)}`); process.exit(2) }
    console.log(`✅ 큐 추가: ${brand} (${reason})`)
    process.exit(0)
  }

  // ── --resolve ──────────────────────────────────────────────
  if (flag('resolve')) {
    const id = opt('resolve')
    const status = opt('status')
    if (!id || !['done', 'failed', 'skipped'].includes(status)) {
      console.error('사용: --resolve <id> --status done|failed|skipped')
      process.exit(2)
    }
    if (dry) { console.log(`(dry) ${id} → ${status}`); process.exit(0) }
    const { error } = await supabase.from('research_queue')
      .update({ status, notes: opt('notes'), resolved_at: new Date().toISOString() }).eq('id', id)
    if (error) { console.error(`⚠️ 확인 불가: ${error.code ?? ''} ${error.message}`); process.exit(2) }
    console.log(`✅ ${id} → ${status}`)
    process.exit(0)
  }

  // ── --claim ────────────────────────────────────────────────
  if (opt('claim')) {
    const n = Number(opt('claim'))
    const { data, error } = await supabase.from('research_queue')
      .select('id,brand_name,market,slug_hint,target_bottleneck,reason,notes')
      .eq('status', 'queued').order('priority').order('created_at').limit(n)
    if (error) { console.error(`⚠️ 확인 불가: ${error.code ?? ''} ${error.message}${missingHint(error.code)}`); process.exit(2) }
    if (!data.length) { console.error('✗ 음성: 큐에 대기 항목이 0건이다 (--plan 을 먼저 돌려라)'); process.exit(1) }
    if (!dry) {
      const upd = await supabase.from('research_queue')
        .update({ status: 'claimed', run_id: opt('run-id') })
        .in('id', data.map((r) => r.id))
      if (upd.error) { console.error(`⚠️ 확인 불가: claim 실패 — ${upd.error.message}`); process.exit(2) }
    }
    console.log(JSON.stringify(data, null, 2))
    process.exit(0)
  }

  // ── --plan N ───────────────────────────────────────────────
  const nRaw = opt('plan')
  if (!nRaw) {
    console.error('사용: --plan N | --list | --add | --claim N | --resolve <id> --status ...')
    process.exit(2)
  }
  const n = Number(nRaw)

  // 커버리지 계산용 조회. 실패는 null 로 돌려 "갭 없음"과 섞지 않는다.
  async function q(table, select) {
    const { data, error } = await supabase.from(table).select(select)
    if (error) {
      console.error(`⚠️ ${table} 조회 실패 — ${error.code ?? ''} ${error.message}${missingHint(error.code)}`)
      return null
    }
    return data
  }
  const studies = await q('case_studies', 'id,slug,brand_name,bottleneck,business_model,buyer_type,price_band,outcome_status,review_status')
  const moves = await q('case_moves', 'id,case_study_id,lever,claim,evidence_grade,outcome_direction,review_status')

  const gaps = coverageGaps(studies, moves)
  if (gaps === null) {
    console.error('⚠️ 확인 불가: 커버리지를 못 읽어 계획을 세우지 않는다. "갭 0개"가 아니다.')
    process.exit(2)
  }

  // 이미 큐에 있는 것과 이미 적립된 브랜드는 뺀다. 최종 중복 방어선은
  // case_studies.slug UNIQUE 다 — 여기선 사람이 보는 낭비를 줄이는 정도다.
  const pending = await supabase.from('research_queue')
    .select('brand_name').in('status', ['queued', 'claimed'])
  if (pending.error) {
    console.error(`⚠️ 확인 불가: research_queue 조회 실패 — ${pending.error.code ?? ''} ${pending.error.message}${missingHint(pending.error.code)}`)
    process.exit(2)
  }
  const excludeBrands = new Set([
    ...(pending.data ?? []).map((r) => r.brand_name),
    ...(studies ?? []).map((s) => s.brand_name),
  ])

  const feedback = readOpenFeedback()
  let plan
  try {
    plan = buildPlan({ n, gaps, feedback, excludeBrands })
  } catch (e) {
    console.error(`✗ ${e.message}`)
    process.exit(1)
  }

  const quota = enforceFailureQuota(plan)
  if (!quota.ok) {
    console.error(`✗ 음성: ${quota.reason}`)
    console.error('  아무것도 쓰지 않았다. 큐를 비우거나 --plan N 을 키워서 다시 돌려라.')
    process.exit(1)
  }

  console.log(`# 조사 계획 ${plan.length}건 (요청 ${n}) — ${quota.reason}`)
  for (const r of plan) {
    console.log(`- ${r.brand_name} · ${r.target_bottleneck ?? '병목미정'} · ${r.reason} · p${r.priority}`)
    if (r.notes) console.log(`    ${r.notes}`)
  }
  console.log(`\n갭: ${gaps.map((g) => `${g.bottleneck}(${g.cases})`).join(' ') || '없음'}`)

  if (dry) {
    console.log('\n(dry) DB 에 쓰지 않았다.')
    process.exit(0)
  }

  const rows = plan.map(({ _feedbackFile, ...r }) => ({ ...r, requested_by: 'research-queue.mjs', status: 'queued' }))
  const ins = await supabase.from('research_queue').insert(rows).select('id')
  if (ins.error) {
    console.error(`⚠️ 확인 불가: 큐 저장 실패 — ${ins.error.code ?? ''} ${ins.error.message}${missingHint(ins.error.code)}`)
    process.exit(2)
  }

  // 반영한 피드백은 파일을 지우지 않고 프론트매터만 갱신한다.
  for (const r of plan) {
    if (!r._feedbackFile) continue
    const text = fs.readFileSync(r._feedbackFile, 'utf-8')
    fs.writeFileSync(r._feedbackFile, setFrontmatterStatus(text, 'ingested'), 'utf-8')
    console.log(`  · ${path.basename(r._feedbackFile)} → status: ingested (파일은 남긴다)`)
  }

  console.log(`\n✅ research_queue 에 ${ins.data.length}행 저장`)
  process.exit(0)
}
