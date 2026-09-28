// 케이스 무브 자동 승인 `ca-v1` — 순수 부품(DB·시계·네트워크 없음). 집행은 scripts/case-auto-approve.mjs.
//
// 권한 근거: CLAUDE.md §10.1 예외 2. 규칙의 정본: reports/2026-09-28/case-approval-linkage-design.md §4,
// 수치·단계·킬스위치·되돌리기의 정본: docs/case-approval-automation-roadmap.md §1·§3·§4.
//   단계     → parseStage: 리포 변수 CASE_AUTO_APPROVAL_STAGE = off(기본) | candidate(2단계) | approve(3단계)
//   규칙     → moveEligibility(설계 §4-1 조건 6개) · caseEligibility(§4-2)
//   킬스위치 → caseAutoApprovalGate: 연결 테이블 3상태 · rr-v1 종속 · ca-v1 감사 창(30건, p0 5% → 4건)
//   되돌리기 → selectRevert(로드맵 §4-2): 자기 태그 ∧ 사람 미개입만
//   노출     → caseExposure: 자동 승인 ∧ 사람 미검수 = '검증중'(목록 아래로, 배지)
//
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다. `@/` 별칭·enum 을 쓰지 않는다.

import { KILL, killSwitch, parseSince, type AuditRow, type GateResult, type KillParams, type KillResult } from '../analysis/auto-approval.ts'

/** 조건 버전 태그. 조건을 완화하면 새 태그(ca-v2) — 옛 승인·감사 창과 섞이지 않게(로드맵 §0-2). */
export const CASE_AUTO_APPROVAL_RULE = 'ca-v1'
/** 되돌린 행에 남기는 태그. 되돌린 사실이 행의 부재로 사라지지 않게(§7.1). */
export const CASE_AUTO_APPROVAL_REVERTED = 'ca-v1:reverted'
/** 연결 VOC 최소 건수. 근거: 설계 §4-1 조건 1 — 사실확인 A(원 관측 2개)보다 한 단계 보수적. */
export const CA_MIN_LINKED = 3
/** 하루 감사 카드. 근거: 로드맵 §3-3 — 카드 10/일 예산의 20%. */
export const CA_AUDIT_DAILY = 2

/** 3단계 킬스위치. 근거: 로드맵 §3-3 — 창 30 · p0 5% → 문턱 4 · 워밍업 14일/10건 · 최근 14일 < 8건이면 확인 불가. */
export const CA_KILL: KillParams = { p0: 0.05, window: 30, minAudits: KILL.minAudits, warmupDays: KILL.warmupDays, minRecentAudits: 8 }
/** 2단계 후보 표시 자동 내림. 근거: 로드맵 §3-2 — 최근 60건 중 반려 ≥ 7(tripThreshold(60, 0.05)). 표시는 위험이 없어 확인 불가로는 내리지 않는다. */
export const CA_CANDIDATE_KILL: KillParams = { p0: 0.05, window: 60, minAudits: KILL.minAudits, warmupDays: KILL.warmupDays, minRecentAudits: 0 }

export const CASE_STAGES = ['off', 'candidate', 'approve'] as const
export type CaseStage = (typeof CASE_STAGES)[number]

/** 어휘 밖 값은 off — 오타가 자동 승인을 켜지 않게. */
export function parseStage(v: string | null | undefined): CaseStage {
  const s = String(v ?? '').trim().toLowerCase()
  return (CASE_STAGES as readonly string[]).includes(s) ? (s as CaseStage) : 'off'
}

// ── 규칙 ────────────────────────────────────────────────────

export interface CaMove {
  id: string
  case_study_id: string
  review_status: string
  reviewed_by: string | null
  metric_after: unknown
  outcome_direction: string | null
  transfer_note: string | null
  preconditions: string | null
  created_at: string | null
  auto_approval_rule?: string | null
}

/** 연결 입력 1건의 판정 행. null = 판정 행이 없다(미판정). */
export type LinkedVerdict = {
  project_id: string | null
  human_verdict: string | null
  auto_approved_at: string | null
} | null

export type Eligibility = { ok: boolean; reason: string }
const no = (reason: string): Eligibility => ({ ok: false, reason })
const filled = (s: string | null | undefined) => typeof s === 'string' && s.trim() !== ''

/**
 * 무브가 ca-v1 후보인가 — 설계 §4-1 조건 6개 + 시행일. 하나라도 못 지키면 false.
 * 값이 **없는 것(undefined)** 은 NULL 이 아니다 — 컬럼을 못 읽었으면 후보가 아니다(§7.1).
 */
export function moveEligibility(m: CaMove, links: readonly LinkedVerdict[], since: Date): Eligibility {
  // 6. 사람이 손대지 않은 draft
  if (m.review_status !== 'draft') return no(`상태 ${m.review_status}`)
  if (m.reviewed_by !== null) return no('사람이 이미 봤다(reviewed_by)')
  // 3. 수치 없는 무브만 — 수치 주장은 영구 사람 몫
  if (m.metric_after !== null) return no('수치 있는 무브(metric_after)')
  // 4. 부정 사례 아님. SQL `<> 'negative'` 는 NULL 도 떨어뜨린다 — 같게 맞춘다.
  if (m.outcome_direction == null || m.outcome_direction === 'negative') return no(`outcome_direction ${m.outcome_direction ?? 'NULL'}`)
  // 5. 행동·전제 기재
  if (!filled(m.transfer_note) || !filled(m.preconditions)) return no('transfer_note·preconditions 미기재')
  // 시행일 전 적립 무브는 대상이 아니다(백필 불가 — 설계 §6).
  const t = m.created_at ? Date.parse(m.created_at) : NaN
  if (!Number.isFinite(t) || t < since.getTime()) return no('시행일 전 적립 또는 적립일 모름')
  // 1. 연결 ≥ 3건 · 같은 project_id
  if (links.length < CA_MIN_LINKED) return no(`연결 VOC ${links.length}건(필요 ${CA_MIN_LINKED})`)
  if (links.some((v) => v === null)) return no('판정 행 없는 연결 입력이 있다')
  const projects = new Set(links.map((v) => v!.project_id))
  if (projects.size !== 1 || projects.has(null)) return no('연결 입력의 project_id 가 하나가 아니다')
  // 2. 전부 승인 — 과반 아님
  for (const v of links as NonNullable<LinkedVerdict>[]) {
    if (v.human_verdict === 'irrelevant' || v.human_verdict === 'unknown') return no(`사람 판정 ${v.human_verdict} 인 연결 입력`)
    if (!(v.auto_approved_at != null || v.human_verdict === 'relevant')) return no('미승인 연결 입력')
  }
  return { ok: true, reason: `연결 VOC ${links.length}건 전부 승인` }
}

export interface CaStudy {
  id: string
  review_status: string
  reviewed_by: string | null
  bottleneck: string | null
  reader_problem: string | null
  auto_approval_rule?: string | null
}

/**
 * 케이스가 따라가는가 — 설계 §4-2. 무브 **전부** approved + 매칭 축 기재 + 사람 미개입 draft.
 * 추가 조건: ca-v1 무브가 1건 이상. 사람이 무브만 승인하고 케이스를 안 누른 것([/cases 승인 버튼이 둘])을
 * 기계가 대신 누르지 않는다 — 그건 이 예외의 범위가 아니다.
 */
export function caseEligibility(s: CaStudy, moves: readonly Pick<CaMove, 'review_status' | 'auto_approval_rule'>[]): Eligibility {
  if (s.review_status !== 'draft') return no(`상태 ${s.review_status}`)
  if (s.reviewed_by !== null) return no('사람이 이미 봤다(reviewed_by)')
  if (!filled(s.bottleneck) || !filled(s.reader_problem)) return no('bottleneck·reader_problem 미기재')
  if (moves.length === 0) return no('무브 0개')
  if (moves.some((m) => m.review_status !== 'approved')) return no('승인 안 된 무브가 있다')
  if (!moves.some((m) => m.auto_approval_rule === CASE_AUTO_APPROVAL_RULE)) return no('ca-v1 무브 없음 — 사람 승인만으로 된 케이스는 사람이 연다')
  return { ok: true, reason: `무브 ${moves.length}개 전부 승인` }
}

// ── 게이트·킬스위치 ─────────────────────────────────────────

/** 감사 1건 = 기계가 표시/승인했고 사람이 그 뒤 결정한 무브. 사람이 approved 로 둔 것이 정답, 그 밖(draft·rejected)이 오류. */
export type CaAuditRow = { review_status: string; reviewed_at: string | null }

export const toAuditRows = (rows: readonly CaAuditRow[]): AuditRow[] =>
  rows.map((r) => ({ human_verdict: r.review_status === 'approved' ? 'relevant' : 'irrelevant', human_graded_at: r.reviewed_at }))

export type LinkTableState = 'present' | 'absent' | 'unverifiable'

export interface CaseGateResult {
  on: boolean
  stage: CaseStage
  reason: string
  since: Date | null
  kill: KillResult | null
  /** 3단계 킬스위치(tripped·unverifiable)가 걸렸다 → 이미 자동 승인된 행을 draft 로 되돌린다(로드맵 §4-2). */
  revert: boolean
}

/**
 * 오늘 돌려도 되나. 단계 → 시행일 → 연결 테이블 → rr-v1 종속 → 감사 조회 → 킬스위치 순으로 하나라도 막히면 끈다.
 * 올리는 것은 사람(변수)이고, 기계는 끄기만 한다.
 * rr-v1 이 닫히면(꺼짐·킬스위치·확인 불가) 닫기만 하고 되돌리지 않는다 — 관련성이 의심스럽다는 것이지 케이스가
 * 틀렸다는 증거는 아니다(로드맵 §4-1).
 */
export function caseAutoApprovalGate(input: {
  stage: string | null | undefined
  since: string | null | undefined
  now: Date
  rr: Pick<GateResult, 'on' | 'reason'> | null
  linkTable: LinkTableState
  audits: readonly CaAuditRow[] | null
}): CaseGateResult {
  const stage = parseStage(input.stage)
  const off = (reason: string, extra: Partial<CaseGateResult> = {}): CaseGateResult =>
    ({ on: false, stage, reason, since: null, kill: null, revert: false, ...extra })
  if (stage === 'off') return off('CASE_AUTO_APPROVAL_STAGE=off(기본값)')
  const since = parseSince(input.since)
  if (!since) return off(`CASE_AUTO_APPROVAL_SINCE 가 없거나 날짜가 아니다(${String(input.since ?? '')})`)
  if (since.getTime() > input.now.getTime()) return off(`시행일 ${input.since} 이 아직 오지 않았다`, { since })
  if (input.linkTable !== 'present') return off(`case_move_inputs ${input.linkTable === 'absent' ? '없음(마이그 미적용)' : '조회 실패'} — 연결을 확인할 수 없어 끈다`, { since })
  if (!input.rr) return off('rr-v1 게이트 상태 확인 불가 — 끈다', { since })
  if (!input.rr.on) return off(`rr-v1 닫힘(${input.rr.reason}) — 케이스 승인의 유일한 기계 신호가 죽었다`, { since })
  if (input.audits === null) return off('ca 감사 창 조회 실패 — 확인 불가라 끈다', { since })
  const kill = killSwitch(toAuditRows(input.audits), { now: input.now, since, kill: stage === 'approve' ? CA_KILL : CA_CANDIDATE_KILL })
  if (kill.state === 'tripped' || kill.state === 'unverifiable') {
    return off(`킬스위치(${stage}): ${kill.reason}`, { since, kill, revert: stage === 'approve' })
  }
  return { on: true, stage, reason: kill.reason, since, kill, revert: false }
}

// ── 되돌리기 ────────────────────────────────────────────────

/**
 * 로드맵 §4-2 SQL 의 순수 판. 무브: ca-v1 ∧ reviewed_by NULL ∧ approved. 케이스: ca-v1 ∧ reviewed_by NULL ∧
 * (되돌린 뒤) draft 무브가 하나라도 있다. 사람이 본 행(reviewed_by 있음)은 절대 고르지 않는다.
 */
export function selectRevert(
  studies: readonly Pick<CaStudy, 'id' | 'reviewed_by' | 'auto_approval_rule'>[],
  moves: readonly Pick<CaMove, 'id' | 'case_study_id' | 'review_status' | 'reviewed_by' | 'auto_approval_rule'>[],
): { moveIds: string[]; studyIds: string[] } {
  const hit = (r: { reviewed_by: string | null; auto_approval_rule?: string | null }) =>
    r.auto_approval_rule === CASE_AUTO_APPROVAL_RULE && r.reviewed_by === null
  const moveIds = moves.filter((m) => hit(m) && m.review_status === 'approved').map((m) => m.id)
  const reverted = new Set(moveIds)
  const draftStudies = new Set(moves.filter((m) => reverted.has(m.id) || m.review_status === 'draft').map((m) => m.case_study_id))
  const studyIds = studies.filter((s) => hit(s) && draftStudies.has(s.id)).map((s) => s.id)
  return { moveIds, studyIds }
}

// ── 노출 ────────────────────────────────────────────────────

export type CaseExposure = 'verified' | 'verifying'

/**
 * 기계가 승인했고 사람이 아직 안 본 케이스 = '검증중'. 목록에서 검증된 케이스 아래로 내리고 배지를 단다.
 * 승격 = 사람이 감사에서 맞다고 결정해 reviewed_by 가 채워지는 것(되돌리기 판별자와 같은 컬럼 — 새 상태 컬럼을 두지 않는다).
 * 사람 승인 케이스(auto_approval_rule NULL)는 언제나 verified 다.
 */
export function caseExposure(s: { auto_approval_rule?: string | null; reviewed_by?: string | null }): CaseExposure {
  return s.auto_approval_rule != null && !s.reviewed_by ? 'verifying' : 'verified'
}
