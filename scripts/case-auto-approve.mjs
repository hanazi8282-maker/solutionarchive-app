#!/usr/bin/env node
// 케이스 무브 자동 승인 ca-v1 — 연결 VOC 가 전부 승인된 수치 없는 긍정 무브를 표시(2단계) 또는 승인(3단계)한다.
//
// ⛔ 기본 꺼짐. 리포 변수 CASE_AUTO_APPROVAL_STAGE=candidate|approve 와 CASE_AUTO_APPROVAL_SINCE=<YYYY-MM-DD> 가 있어야 돈다.
//    켜는 조건: CLAUDE.md §10.1 예외 2 의 가동 전제 3개 + docs/case-approval-automation-roadmap.md §2 진입 조건표.
//
// 하는 것: 게이트(단계 → 시행일 → case_move_inputs 3상태 → rr-v1 종속 → ca 감사 창 킬스위치, lib/cases/case-auto-approval.ts)
//   → 후보 조회 → 조건부 UPDATE. 3단계 킬스위치가 걸리면 자기 태그 ∧ 사람 미개입 행만 draft 로 되돌린다(로드맵 §4-2).
// 안 하는 것: reviewed_by·review_note·transferability·등급을 쓰지 않는다. 사람이 본 행은 건드리지 않는다. 발행 없음.
//   `case_move_inputs` 테이블을 만들지 않는다 — 없으면 확인 불가로 닫힌다.
//
//   node --env-file=.env.local scripts/case-auto-approve.mjs --dry
// 종료코드: 0 정상(꺼짐·킬스위치 포함 — 사유는 로그·Notion) · 2 설정/조회 실패 · 3 저장 실패

import { createClient } from '../lib/supabase/server.ts'
import { AUTO_APPROVAL_RULE as RR_RULE, autoApprovalGate } from '../lib/analysis/auto-approval.ts'
import {
  CASE_AUTO_APPROVAL_RULE as RULE, CASE_AUTO_APPROVAL_REVERTED,
  caseAutoApprovalGate, caseEligibility, moveEligibility, parseStage, selectRevert,
} from '../lib/cases/case-auto-approval.ts'
import { createTracker } from './agent-status.mjs'
import { kstDate, recordStatusLog } from './notion-status-log.mjs'

const dry = process.argv.includes('--dry')
const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`)
const warn = (m) => { if (process.env.GITHUB_ACTIONS) console.log(`::warning::${m}`); log(`⚠️ ${m}`) }
const now = new Date()
const stamp = now.toISOString()

const stage = parseStage(process.env.CASE_AUTO_APPROVAL_STAGE)
// 꺼져 있으면 DB 도 열지 않는다 — 꺼진 기능이 실패를 만들지 않게.
if (stage === 'off') {
  log('케이스 자동 승인 꺼짐(CASE_AUTO_APPROVAL_STAGE≠candidate|approve) — 아무것도 하지 않는다.')
  process.exit(0)
}

const sb = await createClient()
if (!sb) { console.error('✗ DB 연결 실패 — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(2) }

const colMissing = (e) => e && (e.code === '42703' || e.code === 'PGRST204')
const must = (res, what) => {
  if (res.error) {
    console.error(`✗ ${what} 실패: ${res.error.code ?? ''} ${res.error.message}`)
    if (colMissing(res.error)) console.error('  → 마이그 20260930000029_case_auto_approval.sql 미적용인데 단계 변수가 켜져 있다. 켜기 전에 적용하라.')
    process.exit(2)
  }
  return res.data
}
const chunks = (ids, n = 200) => Array.from({ length: Math.ceil(ids.length / n) }, (_, i) => ids.slice(i * n, i * n + n))
async function selectIn(table, cols, col, ids, what) {
  const out = []
  for (const part of chunks(ids)) out.push(...must(await sb.from(table).select(cols).in(col, part), what))
  return out
}

// ── 게이트 입력 ────────────────────────────────────────────
// rr 상태(현재 규칙 rr-v2) — relevance-auto-approve.mjs 와 같은 입력으로 같은 함수를 부른다(종속, 로드맵 §3-3).
const rrAudits = await sb.from('review_relevance_verdicts').select('human_verdict, human_product_informative, human_graded_at')
  .not('auto_approved_at', 'is', null).eq('auto_approval_rule', RR_RULE).not('human_verdict', 'is', null)
if (rrAudits.error) warn(`rr-v1 감사 창 조회 실패: ${rrAudits.error.message}`)
const rr = autoApprovalGate({ enabled: process.env.AUTO_APPROVAL_ENABLED, since: process.env.AUTO_APPROVAL_SINCE, now, audits: rrAudits.error ? null : rrAudits.data })

// 연결 테이블 3상태 — HEAD 가 아니라 limit(0) GET(HEAD 는 없는 테이블에도 204, §7.1).
const probe = await sb.from('case_move_inputs').select('case_move_id').limit(0)
const linkTable = !probe.error ? 'present'
  : /42P01|PGRST205|does not exist/i.test(`${probe.error.code ?? ''} ${probe.error.message}`) ? 'absent' : 'unverifiable'

// ca 감사 창 — 기계가 표시/승인했고 사람이 그 뒤 결정한 무브.
let aq = sb.from('case_moves').select('review_status, reviewed_at').not('reviewed_by', 'is', null)
aq = stage === 'approve' ? aq.eq('auto_approval_rule', RULE) : aq.not('auto_candidate_at', 'is', null)
const caAudits = await aq
if (colMissing(caAudits.error)) must(caAudits, 'ca 감사 창 조회')
if (caAudits.error) warn(`ca 감사 창 조회 실패: ${caAudits.error.message}`)

const gate = caseAutoApprovalGate({
  stage, since: process.env.CASE_AUTO_APPROVAL_SINCE, now, rr, linkTable, audits: caAudits.error ? null : caAudits.data,
})
log(`게이트(${stage}): ${gate.on ? '열림' : '닫힘'} — ${gate.reason}`)

const tracker = dry ? null : await createTracker({
  runKey: `case-auto-approve-${kstDate()}`,
  dept: 'cto',
  trigger: process.env.GITHUB_EVENT_NAME === 'schedule' ? 'cron' : process.env.GITHUB_ACTIONS ? 'manual' : 'local',
  gitSha: process.env.GITHUB_SHA ?? null,
  runUrl: process.env.GITHUB_RUN_ID ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null,
})

// ── 닫힘 (+ 3단계 킬스위치면 되돌리기) ──────────────────────
if (!gate.on) {
  let revert = null
  if (gate.revert) revert = await runRevert()
  warn(`케이스 자동 승인 정지 — ${gate.reason}`)
  if (tracker) {
    await tracker.step({ stepKey: 'gate', label: '케이스 자동 승인 게이트', status: 'blocked', seq: 1, blocker: gate.reason, counts: gate.kill ? { audited: gate.kill.n, errors: gate.kill.errors, recent: gate.kill.recent } : {}, detail: { stage, linkTable, revert } })
    await tracker.finish({ status: 'blocked', summary: { approved: 0, reason: gate.reason, revert } })
    const w = await recordStatusLog({
      date: kstDate(now), track: 'CTO',
      done: revert
        ? `ca-v1 킬스위치 작동 — 신규 0건 · 되돌림 무브 ${revert.moves.length}건 · 케이스 ${revert.studies.length}건(draft, 태그 ${CASE_AUTO_APPROVAL_REVERTED})`
        : `케이스 자동 승인(${stage}) 닫힘 — 오늘 0건`,
      blocked: gate.reason,
      next: revert
        ? `되돌린 무브 id: ${revert.moves.slice(0, 20).join(', ') || '없음'} — 하류 초안 확인 · /library 캐시(CASE_CORPUS_TAG) 만료 필요 · 원인 기록(reports/<날짜>/case-approval-kill-<n>.md)`
        : '원인(연결 테이블·rr-v1·감사 부족)을 확인하고 단계를 유지할지 판단',
      needsHuman: true,
      note: `case-auto-approve · rule ${RULE} · stage ${stage}`,
    })
    log(w.ok ? `Notion 기록: ${w.title}` : `Notion 기록 실패 — ${w.stage}: ${w.error}`)
  }
  process.exit(revert?.failed ? 3 : 0)
}

// ── 후보 ───────────────────────────────────────────────────
// 조건은 DB 쿼리와 moveEligibility 두 번 건다(쿼리를 잘못 고쳐도 순수 함수가 막는다).
const MOVE_COLS = 'id, case_study_id, review_status, reviewed_by, metric_after, outcome_direction, transfer_note, preconditions, created_at, auto_approval_rule, auto_candidate_at'
const moves = []
for (let from = 0; ; from += 1000) {
  let q = sb.from('case_moves').select(MOVE_COLS)
    .eq('review_status', 'draft').is('reviewed_by', null).is('metric_after', null)
    .neq('outcome_direction', 'negative').gte('created_at', gate.since.toISOString())
  if (stage === 'candidate') q = q.is('auto_candidate_at', null)
  const data = must(await q.order('id').range(from, from + 999), 'draft 무브 조회')
  moves.push(...data)
  if (data.length < 1000) break
}
const links = moves.length ? await selectIn('case_move_inputs', 'case_move_id, input_id', 'case_move_id', moves.map((m) => m.id), 'case_move_inputs 조회') : []
const inputIds = [...new Set(links.map((l) => l.input_id))]
const verdicts = inputIds.length ? await selectIn('review_relevance_verdicts', 'input_id, project_id, human_verdict, auto_approved_at', 'input_id', inputIds, '판정 조회') : []
const verdictBy = new Map(verdicts.map((v) => [v.input_id, v]))
const linksBy = new Map()
for (const l of links) linksBy.set(l.case_move_id, [...(linksBy.get(l.case_move_id) ?? []), verdictBy.get(l.input_id) ?? null])

const reasons = {}
const eligible = moves.filter((m) => {
  const r = moveEligibility(m, linksBy.get(m.id) ?? [], gate.since)
  if (!r.ok) reasons[r.reason.replace(/\d+건/g, 'n건')] = (reasons[r.reason.replace(/\d+건/g, 'n건')] ?? 0) + 1
  return r.ok
})
log(`후보 ${eligible.length}건 (조회 ${moves.length}건) · 탈락 사유 ${JSON.stringify(reasons)}`)
if (dry) { log('--dry: 쓰지 않는다.'); process.exit(0) }

let marked = 0, raced = 0, failed = 0
for (const ids of chunks(eligible.map((m) => m.id))) {
  // WHERE 에 조건을 다시 건다 — 그사이 사람이 결정한 무브는 덮지 않는다.
  let q = stage === 'candidate'
    ? sb.from('case_moves').update({ auto_candidate_at: stamp }).is('auto_candidate_at', null)
    : sb.from('case_moves').update({ review_status: 'approved', auto_approved_at: stamp, auto_approval_rule: RULE })
  q = q.in('id', ids).eq('review_status', 'draft').is('reviewed_by', null).is('metric_after', null)
  const { data, error } = await q.select('id')
  if (error) { failed += ids.length; console.error(`✗ 무브 저장 실패: ${error.message}`); continue }
  marked += data.length
  raced += ids.length - data.length
}

// 케이스가 따라간다(3단계만) — ca-v1 무브가 있는 사람 미개입 draft 케이스 중 무브 전부 approved.
let studiesApproved = 0
if (stage === 'approve') {
  const caMoves = must(await sb.from('case_moves').select('case_study_id').eq('auto_approval_rule', RULE).eq('review_status', 'approved'), 'ca-v1 무브 조회')
  const sids = [...new Set(caMoves.map((m) => m.case_study_id))]
  const studies = sids.length ? (await selectIn('case_studies', 'id, review_status, reviewed_by, bottleneck, reader_problem, auto_approval_rule', 'id', sids, '케이스 조회'))
    .filter((s) => s.review_status === 'draft' && s.reviewed_by === null) : []
  const all = studies.length ? await selectIn('case_moves', 'case_study_id, review_status, auto_approval_rule', 'case_study_id', studies.map((s) => s.id), '케이스 무브 조회') : []
  for (const s of studies) {
    if (!caseEligibility(s, all.filter((m) => m.case_study_id === s.id)).ok) continue
    const { data, error } = await sb.from('case_studies')
      .update({ review_status: 'approved', auto_approved_at: stamp, auto_approval_rule: RULE })
      .eq('id', s.id).eq('review_status', 'draft').is('reviewed_by', null).select('id')
    if (error) { failed++; console.error(`✗ 케이스 저장 실패(${s.id}): ${error.message}`); continue }
    studiesApproved += data.length
  }
}

const counts = { marked, raced, failed, studies: studiesApproved }
await tracker.step({ stepKey: stage, label: stage === 'approve' ? 'ca-v1 무브 자동 승인' : 'ca-v1 후보 표시', status: failed ? 'failed' : 'ok', seq: 2, counts, detail: { rule: RULE, gate: gate.reason } })
await tracker.finish({ status: failed ? 'partial' : 'ok', summary: counts })
log(`끝(${stage}) — 무브 ${marked} · 케이스 ${studiesApproved} · 그사이 바뀌어 건너뜀 ${raced} · 실패 ${failed}`)
process.exit(failed ? 3 : 0)

// ── 되돌리기(로드맵 §4-2) — 자기 태그 ∧ 사람 미개입만 ─────────
async function runRevert() {
  const hitMoves = must(await sb.from('case_moves').select('id, case_study_id, review_status, reviewed_by, auto_approval_rule')
    .eq('auto_approval_rule', RULE).is('reviewed_by', null).eq('review_status', 'approved'), '되돌리기 무브 조회')
  const hitStudies = must(await sb.from('case_studies').select('id, reviewed_by, auto_approval_rule')
    .eq('auto_approval_rule', RULE).is('reviewed_by', null), '되돌리기 케이스 조회')
  const sibling = hitStudies.length ? await selectIn('case_moves', 'id, case_study_id, review_status, reviewed_by, auto_approval_rule', 'case_study_id', hitStudies.map((s) => s.id), '되돌리기 형제 무브 조회') : []
  const byId = new Map([...sibling, ...hitMoves].map((m) => [m.id, m]))
  const sel = selectRevert(hitStudies, [...byId.values()])
  log(`되돌리기 대상 — 무브 ${sel.moveIds.length} · 케이스 ${sel.studyIds.length}${dry ? ' (--dry: 쓰지 않는다)' : ''}`)
  if (dry) return { moves: sel.moveIds, studies: sel.studyIds, failed: 0 }
  const patch = { review_status: 'draft', auto_approved_at: null, auto_approval_rule: CASE_AUTO_APPROVAL_REVERTED }
  const done = { moves: [], studies: [], failed: 0 }
  for (const ids of chunks(sel.moveIds)) {
    const { data, error } = await sb.from('case_moves').update(patch).in('id', ids)
      .eq('auto_approval_rule', RULE).is('reviewed_by', null).eq('review_status', 'approved').select('id')
    if (error) { done.failed += ids.length; console.error(`✗ 무브 되돌리기 실패: ${error.message}`); continue }
    done.moves.push(...data.map((r) => r.id))
  }
  for (const ids of chunks(sel.studyIds)) {
    const { data, error } = await sb.from('case_studies').update(patch).in('id', ids)
      .eq('auto_approval_rule', RULE).is('reviewed_by', null).select('id')
    if (error) { done.failed += ids.length; console.error(`✗ 케이스 되돌리기 실패: ${error.message}`); continue }
    done.studies.push(...data.map((r) => r.id))
  }
  return done
}
