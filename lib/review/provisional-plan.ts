// B레인 ② 안전장치 버전 — 임시 등록 "계획"(관찰 모드). 순수 함수만. DB·네트워크 없음. 남헌 v69/v70 + 제1참모 10-14 지시, Fable 검수 #7·#12 반영.
//
// 이 파일은 "무엇을 몇 개 등록할지"만 정한다. 쓰기(마이그레이션 적용)는 대화형 세션이 결과를 보고 한다 — 무인 루프가 analysis_projects 를 직접 쓰지 않는다.
// 안전장치(어느 하나라도 걸리면 자동 등록 0, 사람 확인 목록으로):
//   1) 앵커: 공식 앱과 이름이 맞는 단일 앱(anchored)만. ambiguous·no_match·lookup_failed 는 등록 대상이 아니다(§7.1: 확인 못 한 것을 통과로 접지 않는다).
//   2) 하루 총 상한(전역)과 영역별 상한 — 처음 며칠은 영역당 5.
//   3) 유형별 비율 상한 — 하루 계획에서 한 영역이 40% 를 넘지 않는다(자기 강화 쏠림 방지, Fable #12).
//   4) 첫 10건은 사람 검증 — 사람이 검증한 등록이 10건이 되기 전에는 전부 'human_verify'(자동 등록 0).
//   5) 킬스위치 — 감사 표본이 n≥20 이고 오탐률 >20% 이면 정지. 감사 n<20 이면 '확인 불가'로 자동 등록 0(Fable #7).
import type { AnchorVerdict } from './anchor.ts'
import type { CandidateRow } from './provisional.ts'

export const PLAN_DAILY_TOTAL_CAP = 15
export const PLAN_AREA_CAP_EARLY = 5
export const PLAN_AREA_SHARE_MAX = 0.4
/** 이 값 이상 사람 검증을 마친 뒤에야 자동 등록을 연다. */
export const PLAN_FIRST_VERIFY = 10
export const KILL_FP_RATE = 0.2
export const KILL_MIN_AUDIT = 20
/** 비율 상한은 계획이 이만큼 이상일 때만 건다(1~2건에서 40% 는 의미가 없다). */
const SHARE_MIN_TOTAL = 5

export type PlanCandidate = CandidateRow & { anchor: AnchorVerdict }

export interface PlanState {
  /** 오늘 이미 임시 등록한 수(영역별). */
  registeredToday: Record<string, number>
  /** 지금까지 임시 등록한 총수와, 그중 사람이 검증을 마친 수. */
  registeredTotal: number
  humanVerifiedTotal: number
  /** 임시 등록분 감사 표본: n=채점 수, falsePositive=오탐 수. 표본이 없으면 null(확인 불가). */
  audit: { n: number; falsePositive: number } | null
}

export type KillState = { state: 'ok' | 'stopped' | 'unknown'; reason: string }
export type PlanAction = 'register' | 'human_verify' | 'skip'
export interface PlanDecision {
  key: string
  name: string
  area: string
  action: PlanAction
  reason: string
}

export function killSwitch(state: PlanState): KillState {
  // 사람 검증 10건 전에는 자동 등록 자체가 닫혀 있어 킬스위치 판단이 필요 없다.
  if (state.humanVerifiedTotal < PLAN_FIRST_VERIFY) return { state: 'ok', reason: `사람 검증 ${state.humanVerifiedTotal}/${PLAN_FIRST_VERIFY}건 — 자동 등록은 아직 닫혀 있다` }
  const a = state.audit
  if (!a || a.n < KILL_MIN_AUDIT) return { state: 'unknown', reason: `감사 표본 ${a?.n ?? 0}건 < ${KILL_MIN_AUDIT} — 오탐률 확인 불가이므로 신규 자동 등록 0` }
  const rate = a.falsePositive / a.n
  if (rate > KILL_FP_RATE) return { state: 'stopped', reason: `감사 오탐률 ${(rate * 100).toFixed(0)}% > ${KILL_FP_RATE * 100}% (n=${a.n}) — 정지` }
  return { state: 'ok', reason: `감사 오탐률 ${(rate * 100).toFixed(0)}% ≤ ${KILL_FP_RATE * 100}% (n=${a.n})` }
}

/** 입력 순서(점수순)를 유지한다. 반환 decisions 는 입력과 같은 길이·같은 순서. */
export function planRegistration(cands: PlanCandidate[], state: PlanState): { decisions: PlanDecision[]; kill: KillState; counts: Record<PlanAction, number> } {
  const kill = killSwitch(state)
  const autoOpen = kill.state === 'ok' && state.humanVerifiedTotal >= PLAN_FIRST_VERIFY
  const usedToday = Object.values(state.registeredToday).reduce((n, x) => n + x, 0)
  const byAreaPlanned: Record<string, number> = {}
  let plannedTotal = 0
  const decisions: PlanDecision[] = []

  for (const c of cands) {
    const d = (action: PlanAction, reason: string): PlanDecision => ({ key: c.key, name: c.name, area: String(c.area ?? '?'), action, reason })
    if (kill.state === 'stopped') { decisions.push(d('skip', `킬스위치 정지 — ${kill.reason}`)); continue }
    if (c.anchor.state !== 'anchored') { decisions.push(d('skip', `앵커 ${c.anchor.state} — ${c.anchor.reason}`)); continue }
    const area = String(c.area)
    if (usedToday + plannedTotal >= PLAN_DAILY_TOTAL_CAP) { decisions.push(d('skip', `하루 총 상한 ${PLAN_DAILY_TOTAL_CAP} 도달`)); continue }
    if ((state.registeredToday[area] ?? 0) + (byAreaPlanned[area] ?? 0) >= PLAN_AREA_CAP_EARLY) { decisions.push(d('skip', `영역 ${area} 하루 상한 ${PLAN_AREA_CAP_EARLY} 도달`)); continue }
    byAreaPlanned[area] = (byAreaPlanned[area] ?? 0) + 1
    plannedTotal++
    decisions.push(autoOpen ? d('register', '앵커 일치 · 상한 이내 · 자동 등록 열림') : d('human_verify', kill.state === 'unknown' ? `확인 불가 — ${kill.reason}` : `사람 검증 대기(첫 ${PLAN_FIRST_VERIFY}건) — 앵커 일치`))
  }

  // 유형별 비율 상한 — 계획(등록+사람 확인 대상) 안에서 한 영역이 40% 를 넘으면 그 영역의 뒤쪽을 skip 으로 내린다.
  const planned = decisions.filter((x) => x.action !== 'skip')
  if (planned.length >= SHARE_MIN_TOTAL) {
    const limit = Math.max(1, Math.floor(planned.length * PLAN_AREA_SHARE_MAX))
    const seen: Record<string, number> = {}
    for (const x of decisions) {
      if (x.action === 'skip') continue
      seen[x.area] = (seen[x.area] ?? 0) + 1
      if (seen[x.area] > limit) { x.action = 'skip'; x.reason = `영역 ${x.area} 비율 상한 ${PLAN_AREA_SHARE_MAX * 100}% (계획 ${planned.length}건 중 ≤${limit})` }
    }
  }
  const counts: Record<PlanAction, number> = { register: 0, human_verify: 0, skip: 0 }
  for (const x of decisions) counts[x.action]++
  return { decisions, kill, counts }
}
