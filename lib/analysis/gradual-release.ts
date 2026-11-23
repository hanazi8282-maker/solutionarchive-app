// rr-v2 점진 해제 장치(남헌 v71dc 확정) — 킬스위치가 풀려도 밀린 승인 대기(≈13,500건)가 한 번에 승인되지 않게 하루 상한을 단계로 건다.
//
// ⛔ 기본 꺼짐. 리포 변수 GRADUAL_RELEASE_ENABLED=true 일 때만 이 장치의 단계 규칙이 승인을 지배한다.
//    꺼져 있으면 **게이트가 열려도 승인 0건**이다(decideRelease) — 상한 없는 일괄 승인으로 돌아가는 경로는 없다.
// 킬스위치(auto-approval.ts autoApprovalGate·killSwitch·KILL·scoreApproval)는 건드리지 않는다. 이 장치는 그 뒤에서 **좁히기만** 한다.
//
// 단계 상태는 DB 에 저장하지 않는다(새 스키마 없음):
//   현재 단계   = 리포 변수 GRADUAL_RELEASE_STAGE(1~5) — 사람만 바꾼다. 그래서 "자동으로 안 올린다"가 구조로 보장된다.
//   단계 시작   = 리포 변수 GRADUAL_RELEASE_STAGE_SINCE — KST 날짜(YYYY-MM-DD = 그날 00:00 KST) 또는 ISO UTC 시각(…Z). 사람만 바꾼다.
//                 같은 날 단계를 올릴 때 시각을 쓰면 그 시각 전의 킬스위치 기록·단계 감사는 새 단계에 섞이지 않는다(v71dl).
//   오늘 승인 수 = review_relevance_verdicts(rr-v2 ∧ auto_approved_at 이 오늘 KST) — 하루 여러 슬롯(04·11·15시)을 합쳐 센다.
//   킬스위치 재걸림 = agent_run_steps(relevance-auto-approve 실행의 step 'gate' ∧ blocked ∧ updated_at ≥ STAGE_SINCE) — 있으면 유효 단계 1, 오늘이면 0건.
//     step 은 (run_id, step_key) upsert 라 같은 날 다시 막히면 updated_at 이 그 시각으로 바뀐다 — 그래서 "기록 시각" = updated_at.
//   단계 내 멈춤 = 이 단계(STAGE_SINCE 이후) 승인 글의 사람 채점 오류 ≥ 5(scoreApproval 같은 정의) → 승인 0건. 이미 승인된 글은 취소하지 않는다.
// 무엇이든 못 읽거나 값이 이상하면 "확인 불가 → 승인 0건"(CLAUDE.md §7.1).
//
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다. `@/` 별칭·enum 을 쓰지 않는다. 셀프테스트 scripts/gradual-release-selftest.mjs.

import { AUTO_APPROVAL_RULE, isFullAgreement, passesRrV2ContentGuard, scoreApproval } from './auto-approval.ts'
import type { AuditRow, VerdictRow } from './auto-approval.ts'
import { loadScope } from './approval-scope.ts'
import type { ScopeReason } from './approval-scope.ts'
import { rng } from './relevance-judge.ts'
import { devAudienceReason } from './dev-audience-guard.ts'

export const GRADUAL = {
  /**
   * 단계 → 하루 **누적** 승인 상한(그날 이미 승인한 수 포함, 남헌 v71dl). 같은 날 1→2 로 올리면 1단계에서 승인한 500 을 빼고 1500 더.
   * 5단계 = 상한 없음(2026-11-23·24 에는 쓰지 않는다 — 쓰는 날은 사람이 정한다).
   */
  caps: { 1: 500, 2: 2000, 3: 4500, 4: 5000, 5: Infinity } as Record<number, number>,
  /** 단계 통과 표본 크기. 배분은 sampleQuotas(앱스토어·구글 플레이 고정 몫, 남는 자리는 다른 소스) — quotaSample. */
  sampleSize: 30,
  sampleQuotas: { appstore: 10, googleplay: 6 } as Record<string, number>,
  /** 표본 오류가 이 이하이면 통과, 넘으면 멈춤. */
  maxErrors: 4,
} as const

/** 승인 실행 run_key 접두사 — scripts/relevance-auto-approve.mjs 의 runKey 와 같아야 한다(셀프테스트가 고정). */
export const APPROVE_RUN_PREFIX = 'relevance-auto-approve-'

export function isEnabled(v: string | null | undefined): boolean {
  return String(v ?? '').trim().toLowerCase() === 'true'
}

/** '1'~'5' 정수만. 그 밖은 null(확인 불가). */
export function parseStage(v: string | null | undefined): number | null {
  const s = String(v ?? '').trim()
  return /^[1-5]$/.test(s) ? Number(s) : null
}

/**
 * 단계 시작 시각. 받는 형식 두 가지(그 밖은 null = 확인 불가):
 *   YYYY-MM-DD                    → 그날 00:00 KST. 오늘(KST) 이전·당일만(v71dc 와 같은 동작).
 *   YYYY-MM-DDTHH:MM[:SS[.sss]]Z  → 그 UTC 시각. now 이하만(미래 = null). 오프셋(+09:00 등)은 받지 않는다 — UTC 시각만.
 * 실제 달력·시계 값이 아니면(2월 30일·25시) null.
 */
export function parseStageSince(v: string | null | undefined, todayKst: string, now: Date): Date | null {
  const s = String(v ?? '').trim()
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (d) {
    const u = new Date(Date.UTC(+d[1], +d[2] - 1, +d[3]))
    if (u.getUTCFullYear() !== +d[1] || u.getUTCMonth() !== +d[2] - 1 || u.getUTCDate() !== +d[3]) return null
    return s <= todayKst ? kstDayRange(s).start : null
  }
  const t = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?Z$/.exec(s)
  if (!t) return null
  const [, Y, Mo, D, h, mi, se = '0', ms = '0'] = t
  const u = new Date(Date.UTC(+Y, +Mo - 1, +D, +h, +mi, +se, +ms.padEnd(3, '0')))
  if (u.getUTCFullYear() !== +Y || u.getUTCMonth() !== +Mo - 1 || u.getUTCDate() !== +D || u.getUTCHours() !== +h || u.getUTCMinutes() !== +mi || u.getUTCSeconds() !== +se) return null
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) return null
  return u.getTime() <= now.getTime() ? u : null
}

export function stageCap(stage: number): number {
  const c = GRADUAL.caps[stage]
  return c === undefined ? 0 : c
}

/** 오늘 남은 한도 = 상한 − 오늘 이미 승인한 수(0 미만이면 0). 이미 승인 수를 못 셌으면(비정상 값) 0. */
export function remainingToday(cap: number, approvedToday: number): number {
  if (!Number.isFinite(approvedToday) || approvedToday < 0) return 0
  return Math.max(0, cap - approvedToday)
}

/** KST 날짜의 [00:00, 다음날 00:00) UTC 경계. */
export function kstDayRange(dateKst: string): { start: Date; end: Date } {
  const start = new Date(`${dateKst}T00:00:00+09:00`)
  return { start, end: new Date(start.getTime() + 86_400_000) }
}

export interface ReleaseInput {
  enabled: string | null | undefined
  gateOn: boolean
  stage: string | null | undefined
  stageSince: string | null | undefined
  todayKst: string
  /** 미래 STAGE_SINCE 시각 판정용 현재 시각. */
  now: Date
  /** 아래 셋은 loadReleaseContext 결과. ok:false 면 확인 불가. */
  ctx: ReleaseContext | null
}

export type ReleaseContext =
  | { ok: true; approvedToday: number; trips: string[]; stageAudits: AuditRow[] }
  | { ok: false; error: string }

export interface ReleaseDecision {
  /** 이번 실행에서 승인해도 되는 최대 건수(0 = 승인 안 함). 5단계는 Infinity. */
  limit: number
  enabled: boolean
  stage: number | null
  effectiveStage: number | null
  cap: number | null
  approvedToday: number | null
  stageErrors: number | null
  reason: string
}

/**
 * 이번 실행에서 몇 건까지 승인하나(순수). 순서: 기능 꺼짐 → 게이트 닫힘 → 변수 확인 불가 → 조회 실패 →
 * 킬스위치 재걸림(오늘이면 0, 아니면 유효 단계 1) → 단계 내 오류 ≥5 멈춤 → 상한 − 오늘 승인.
 */
export function decideRelease(i: ReleaseInput): ReleaseDecision {
  const base = { enabled: isEnabled(i.enabled), stage: null, effectiveStage: null, cap: null, approvedToday: null, stageErrors: null }
  // ⛔ 안전 기본값: 기능이 꺼져 있으면 게이트가 열려도 0건.
  if (!base.enabled) return { ...base, limit: 0, reason: 'GRADUAL_RELEASE_ENABLED 꺼짐(기본값) — 게이트가 열려도 승인하지 않는다' }
  if (!i.gateOn) return { ...base, limit: 0, reason: '게이트 닫힘 — 승인하지 않는다' }
  const stage = parseStage(i.stage)
  if (stage === null) return { ...base, limit: 0, reason: `GRADUAL_RELEASE_STAGE 확인 불가(${JSON.stringify(i.stage ?? null)}) — 1~5 정수가 아니라 승인 0건` }
  const sinceAt = parseStageSince(i.stageSince, i.todayKst, i.now)
  if (sinceAt === null) return { ...base, stage, limit: 0, reason: `GRADUAL_RELEASE_STAGE_SINCE 확인 불가(${JSON.stringify(i.stageSince ?? null)}) — 날짜·UTC 시각이 아니거나 미래라 승인 0건` }
  const since = String(i.stageSince).trim()
  if (!i.ctx || !i.ctx.ok) return { ...base, stage, limit: 0, reason: `단계 상태 조회 실패 — 확인 불가라 승인 0건: ${i.ctx && !i.ctx.ok ? i.ctx.error : '없음'}` }
  const { approvedToday, stageAudits } = i.ctx
  // STAGE_SINCE 이전 기록은 이 단계의 재걸림이 아니다. 시각을 못 읽는 기록은 남긴다(아래에서 "오늘"로 본다 — §7.1).
  const trips = i.ctx.trips.filter((t) => { const x = Date.parse(t); return !Number.isFinite(x) || x >= sinceAt.getTime() })
  const todayStart = kstDayRange(i.todayKst).start.getTime()
  const stageErrors = stageAudits.filter((a) => scoreApproval(a) === 'error').length
  const known = { ...base, stage, approvedToday, stageErrors }
  if (trips.length > 0) {
    const tripsToday = trips.filter((t) => Date.parse(t) >= todayStart).length
    if (tripsToday > 0 || trips.some((t) => !Number.isFinite(Date.parse(t)))) {
      return { ...known, effectiveStage: 1, cap: 0, limit: 0, reason: `킬스위치가 오늘 다시 걸렸다(${tripsToday}회) — 유효 단계 1, 오늘 승인 0건` }
    }
  }
  const effectiveStage = trips.length > 0 ? 1 : stage
  if (stageErrors > GRADUAL.maxErrors) {
    return { ...known, effectiveStage, cap: 0, limit: 0, reason: `${since} 이후 이 단계 승인 글 사람 채점 오류 ${stageErrors}건(허용 ${GRADUAL.maxErrors}) — 단계 멈춤, 승인 0건` }
  }
  const cap = stageCap(effectiveStage)
  const limit = remainingToday(cap, approvedToday)
  const tripNote = trips.length > 0 ? ` · ${since} 이후 킬스위치 재걸림 ${trips.length}회로 단계 ${stage}→1` : ''
  return { ...known, effectiveStage, cap, limit, reason: `단계 ${effectiveStage} 상한 ${cap === Infinity ? '없음' : cap} − 오늘 이미 ${approvedToday} = 남은 ${limit === Infinity ? '무제한' : limit}${tripNote}` }
}

export interface PoolRow extends VerdictRow { source_key: string }

/**
 * 최신(judged_at 내림차순) 우선 + 소스별 라운드 로빈으로 limit 건(순수). 소스 순서는 각 소스의 최신 글 시각 내림차순.
 *
 * ⚠️ 라운드 로빈은 소스 크기를 보지 않는다(v71dm 관찰): 한 바퀴에 소스마다 1건씩 가져가므로, 한도가 차는 k 바퀴째에
 *   글이 k 건 이상 남은 소스는 **모두 같은 k 건**(±1)을 받는다. 2026-11-23 2단계(2,000건)에서 작은 포럼 소스들이 각 ≈77건씩
 *   승인된 것은 이 구조와 맞는다(2,000 ÷ 소스 ≈26 ≈ 77 — DB 로 소스 수를 다시 재지는 않았다). 풀에서 몫이 작은 소스도 앱스토어와 같은 수를 받아 승인분에서 과대 대표된다.
 *   선택 규칙(상한·순서)은 바꾸지 않았다 — 대신 AUTO_APPROVAL_SOURCES(parseSourceAllowlist)로 승인 대상 소스 자체를 좁힌다.
 */
export function selectRelease<T extends { input_id: string; source_key: string; judged_at?: string | null }>(rows: readonly T[], limit: number): T[] {
  if (!(limit > 0)) return []
  const t = (r: T) => { const x = Date.parse(r.judged_at ?? ''); return Number.isFinite(x) ? x : -Infinity }
  const bySource = new Map<string, T[]>()
  for (const r of rows) { const a = bySource.get(r.source_key) ?? []; a.push(r); bySource.set(r.source_key, a) }
  const queues = [...bySource.values()].map((a) => a.slice().sort((x, y) => t(y) - t(x) || x.input_id.localeCompare(y.input_id)))
  queues.sort((a, b) => t(b[0]) - t(a[0]) || a[0].source_key.localeCompare(b[0].source_key))
  const out: T[] = []
  for (let k = 0; out.length < limit; k++) {
    let took = false
    for (const q of queues) { if (k < q.length && out.length < limit) { out.push(q[k]); took = true } }
    if (!took) break
  }
  return out
}

export function countBySource(rows: readonly { source_key: string }[]): Record<string, number> {
  return rows.reduce<Record<string, number>>((m, r) => ({ ...m, [r.source_key]: (m[r.source_key] ?? 0) + 1 }), {})
}

/** 소스별 층화 표본(순수, 재현 가능). 비례 배분 + 소스당 최소 1(소스 수 ≤ n 일 때), 남는 자리는 큰 나머지 순. */
export function stratifiedSample<T extends { input_id: string; source_key: string }>(rows: readonly T[], n: number, seed = 42): T[] {
  if (n <= 0 || rows.length === 0) return []
  if (rows.length <= n) return rows.slice().sort((a, b) => a.input_id.localeCompare(b.input_id))
  const random = rng(seed)
  const groups = [...rows.reduce((m, r) => m.set(r.source_key, [...(m.get(r.source_key) ?? []), r]), new Map<string, T[]>())]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([k, g]) => { const a = g.slice().sort((x, y) => x.input_id.localeCompare(y.input_id)); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return { k, a } })
  const floorMin = groups.length <= n ? 1 : 0
  const alloc = groups.map((g) => { const q = (g.a.length / rows.length) * n; return { g, take: Math.min(g.a.length, Math.max(floorMin, Math.floor(q))), rem: q - Math.floor(q) } })
  let left = n - alloc.reduce((s, x) => s + x.take, 0)
  // 최소 1 보장으로 넘쳤으면 큰 그룹에서 덜어낸다.
  while (left < 0) { const x = alloc.filter((y) => y.take > 1).sort((a, b) => b.take - a.take)[0]; x.take--; left++ }
  for (const x of alloc.slice().sort((a, b) => b.rem - a.rem || b.g.a.length - a.g.a.length)) { if (left <= 0) break; if (x.take < x.g.a.length) { x.take++; left-- } }
  // 그래도 남으면(작은 그룹이 다 찼다) 남은 그룹에서 채운다.
  for (const x of alloc) { while (left > 0 && x.take < x.g.a.length) { x.take++; left-- } }
  return alloc.flatMap((x) => x.g.a.slice(0, x.take)).sort((a, b) => a.input_id.localeCompare(b.input_id))
}

/**
 * 단계 통과 표본 배분(v71dl, 순수·재현 가능). 고정 몫 소스(GRADUAL.sampleQuotas — 앱스토어 10·구글 플레이 6)는 그 몫까지 먼저,
 * 남은 자리(기본 30 − 16 = 14)는 나머지 소스에 stratifiedSample(비례·소스당 최소 1)로 나눈다.
 * 어느 쪽이든 모자라면 아직 안 뽑힌 글(소스 무관)에서 채워 총 n 을 맞춘다. 모집단이 n 이하면 전부.
 */
export function quotaSample<T extends { input_id: string; source_key: string }>(rows: readonly T[], n: number, quotas: Record<string, number> = GRADUAL.sampleQuotas, seed = 42): T[] {
  const byId = (a: T, b: T) => a.input_id.localeCompare(b.input_id)
  if (n <= 0 || rows.length === 0) return []
  if (rows.length <= n) return rows.slice().sort(byId)
  const random = rng(seed)
  const shuffled = (xs: readonly T[]) => { const a = xs.slice().sort(byId); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a }
  const picked: T[] = []
  for (const [k, q] of Object.entries(quotas).sort((a, b) => a[0].localeCompare(b[0]))) {
    picked.push(...shuffled(rows.filter((r) => r.source_key === k)).slice(0, Math.max(0, Math.min(q, n - picked.length))))
  }
  const others = rows.filter((r) => !Object.hasOwn(quotas, r.source_key))
  picked.push(...stratifiedSample(others, Math.max(0, n - picked.length), seed))
  if (picked.length < n) {
    const taken = new Set(picked.map((r) => r.input_id))
    picked.push(...shuffled(rows.filter((r) => !taken.has(r.input_id))).slice(0, n - picked.length))
  }
  return picked.sort(byId)
}

/**
 * 단계 통과 표본의 모집단(v71dm, 순수) — 그날 승인된 글에서 **원문 없음만** 뺀다. 지금의 승인 가드가 막았을 글도 그대로 남는다
 * (이미 승인된 글의 품질을 재는 표본이라, 거르면 오류가 숨는다). reasonOf 는 머리글 집계(ruleOut)에만 쓴다.
 */
export function stagePopulation<T extends { input_id: string }>(approved: readonly T[], textById: ReadonlyMap<string, { source_key?: string | null; raw_text?: string | null }>, reasonOf: ReadonlyMap<string, string>): { pool: (T & { source_key: string; text: string })[]; dropped: number; ruleOut: Record<string, number> } {
  const rows = approved.map((r) => ({ ...r, source_key: textById.get(r.input_id)?.source_key ?? '(소스 미상)', text: textById.get(r.input_id)?.raw_text ?? '' }))
  const pool = rows.filter((r) => r.text.trim().length > 0)
  const ruleOut: Record<string, number> = {}
  for (const r of pool) { const why = reasonOf.get(r.input_id); if (why) ruleOut[why] = (ruleOut[why] ?? 0) + 1 }
  return { pool, dropped: approved.length - pool.length, ruleOut }
}

export type StageJudgement ={ state: 'pass' | 'stop' | 'insufficient'; scored: number; errors: number; reason: string }

/** 단계 통과 판정(순수). 채점(scoreApproval≠null) 30건 이상 ∧ 오류 ≤4 = 통과, 오류 ≥5 = 멈춤, 그 밖 = 확인 불가. */
export function judgeStage(audits: readonly AuditRow[]): StageJudgement {
  const s = audits.map(scoreApproval).filter((x) => x !== null)
  const errors = s.filter((x) => x === 'error').length
  const scored = s.length
  if (errors > GRADUAL.maxErrors) return { state: 'stop', scored, errors, reason: `오류 ${errors}건(≥${GRADUAL.maxErrors + 1}) — 이 단계에서 멈춘다` }
  if (scored < GRADUAL.sampleSize) return { state: 'insufficient', scored, errors, reason: `채점 ${scored}건(<${GRADUAL.sampleSize}) — 확인 불가` }
  return { state: 'pass', scored, errors, reason: `채점 ${scored}건 중 오류 ${errors}건(≤${GRADUAL.maxErrors}) — 통과` }
}

interface Sb { from: (t: string) => any }

async function readAll(build: () => any): Promise<{ data: any[]; error: any }> {
  const out: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().range(from, from + 999)
    if (error) return { data: out, error }
    out.push(...(data ?? []))
    if ((data ?? []).length < 1000) return { data: out, error: null }
  }
}

/**
 * 상한 카운터의 시작 시각(v71ds) = KST 하루 시작과 STAGE_SINCE 중 늦은 쪽. 단계를 새로 시작한 날(STAGE_SINCE 가 오늘 한낮)에는
 * 그 전에 이미 승인된 건이 새 단계 상한을 먹지 않는다. 다음 날부터는 하루 시작이 더 늦어 기존 동작과 같다.
 */
export function counterStart(dayStart: Date, stageSince: Date): Date {
  return stageSince.getTime() > dayStart.getTime() ? stageSince : dayStart
}

/** 단계 판단에 필요한 DB 상태(읽기 전용). 하나라도 실패하면 ok:false(확인 불가). */
export async function loadReleaseContext(sb: Sb, opts: { stageSince: Date; todayKst: string }): Promise<ReleaseContext> {
  const { start, end } = kstDayRange(opts.todayKst)
  const stageStart = opts.stageSince
  // 실행 행(run_key 하루 1개)은 그날 첫 슬롯에 만들어지고 started_at 이 그대로다 — 시각 STAGE_SINCE 보다 먼저 시작한 그날 실행이
  // 뒤 슬롯에서 다시 막힐 수 있으므로 실행은 하루 앞까지 넓게 읽고, 시각 판정은 step updated_at 으로 한다.
  const runsFrom = new Date(stageStart.getTime() - 86_400_000)
  const today = await readAll(() => sb.from('review_relevance_verdicts').select('input_id')
    .eq('auto_approval_rule', AUTO_APPROVAL_RULE).gte('auto_approved_at', start.toISOString()).lt('auto_approved_at', end.toISOString()).order('input_id'))
  if (today.error) return { ok: false, error: `오늘 승인 수 조회 실패: ${today.error.message}` }
  const runs = await readAll(() => sb.from('agent_runs').select('id').like('run_key', `${APPROVE_RUN_PREFIX}%`).gte('started_at', runsFrom.toISOString()).order('id'))
  if (runs.error) return { ok: false, error: `agent_runs 조회 실패: ${runs.error.message}` }
  const trips: string[] = []
  const ids = runs.data.map((r) => r.id)
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await sb.from('agent_run_steps').select('run_id, updated_at').in('run_id', ids.slice(i, i + 200)).eq('step_key', 'gate').eq('status', 'blocked').gte('updated_at', stageStart.toISOString())
    if (error) return { ok: false, error: `agent_run_steps 조회 실패: ${error.message}` }
    for (const s of data ?? []) trips.push(String(s.updated_at ?? ''))
  }
  const audits = await readAll(() => sb.from('review_relevance_verdicts').select('human_verdict, human_product_informative, human_graded_at')
    .eq('auto_approval_rule', AUTO_APPROVAL_RULE).gte('auto_approved_at', stageStart.toISOString()).not('human_verdict', 'is', null).order('input_id'))
  if (audits.error) return { ok: false, error: `단계 감사 조회 실패: ${audits.error.message}` }
  return { ok: true, approvedToday: today.data.length, trips, stageAudits: audits.data }
}

export type GuardDrop = { github_issues: number; short: number; missing: number; 'source-not-allowed': number; 'dev-audience': number }
/** 승인 가드에서 빠지는 사유. 'missing' = 글을 못 읽었다(확인 불가). */
export type GuardReason = ScopeReason | keyof GuardDrop

export type ApprovalGuardResult =
  | { ok: true; reasonOf: Map<string, GuardReason>; sourceOf: Map<string, string>; scopeExcluded: Record<string, number>; guardDrop: GuardDrop; devAudience: Record<string, number> }
  | { ok: false; error: string }

/**
 * 자동 승인 소스 허용 목록(v71dm) — 리포 변수 AUTO_APPROVAL_SOURCES(쉼표로 구분한 source_key).
 *   없음(undefined·null)·정확히 '' → allow:null = 제한 없음(오늘까지의 동작 그대로).
 *   값이 있으면 그 소스의 글만 승인 대상, 나머지는 승인하지 않고 "사람 확인 대기"로 남는다.
 *   이상한 값(공백·줄바꿈만·빈 항목·대문자·공백 섞인 키·문자열 아님) → ok:false = 확인 불가 → 승인 0건(§7.1). "제한 없음"으로 접지 않는다.
 */
export type SourceAllowlist = { ok: true; allow: ReadonlySet<string> | null } | { ok: false; error: string }
export function parseSourceAllowlist(v: unknown): SourceAllowlist {
  if (v === undefined || v === null) return { ok: true, allow: null }
  if (typeof v !== 'string') return { ok: false, error: `AUTO_APPROVAL_SOURCES 확인 불가(문자열 아님) — 승인 0건` }
  // 정확히 '' 만 "없음"이다(워크플로 `vars.X || ''`). 공백·줄바꿈만 있는 값은 누가 무언가 넣으려다 실패한 것 — 확인 불가.
  if (v === '') return { ok: true, allow: null }
  const keys = v.split(',').map((k) => k.trim())
  const bad = keys.filter((k) => !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(k))
  if (bad.length) return { ok: false, error: `AUTO_APPROVAL_SOURCES 확인 불가(${JSON.stringify(v)} — 이상한 항목 ${JSON.stringify(bad)}) — 승인 0건` }
  return { ok: true, allow: new Set(keys) }
}

/**
 * 승인 가드 한 벌(v71dl) — **승인 대상 풀(loadApprovalPool)과 킬스위치 감사 창(loadGuardedAuditWindow)이 이 함수 하나를 쓴다.**
 * 조건을 복사하지 않는다(셀프테스트가 정적으로 고정): 영역 밖(area_code 'out-*')·소비재 태그 = loadScope/outOfScopeReason,
 * github_issues·본문 60자 미만·글 못 읽음 = passesRrV2ContentGuard. 사유가 없는 id 가 가드 통과다.
 * 어느 표든 못 읽으면 ok:false(§7.1) — 호출부가 승인 0건·게이트 닫힘으로 처리한다.
 * v71dm: 내용 가드 통과분에 두 가지를 더 본다 — opts.allow(소스 허용 목록, null = 제한 없음) 밖이면 'source-not-allowed',
 *   devAudienceReason(개발자·관리자 대상 글, 앱스토어·구글 플레이 제외)이 걸리면 'dev-audience'(패턴 id 는 devAudience 에 집계).
 *   둘 다 AUDIT_WINDOW_EXCLUDE 에 넣지 않는다 — 감사 창은 그 행을 그대로 센다(킬스위치를 느슨하게 만들지 않는다).
 */
export async function applyApprovalGuard(sb: Sb, inputIds: readonly string[], opts: { allow?: ReadonlySet<string> | null } = {}): Promise<ApprovalGuardResult> {
  const ids = [...new Set(inputIds)]
  // L-20b: 영역 외(out-*)·소비재 태그 제외.
  const scope = await loadScope(sb, ids)
  if (!scope.ok) return { ok: false, error: `영역·소비재 태그 조회 실패: ${scope.error}` }
  const reasonOf = new Map<string, GuardReason>(scope.excluded)
  const scoped = ids.filter((id) => !scope.excluded.has(id))
  // v71cp P1-F: 내용 가드.
  const textById = new Map<string, { source_key?: string | null; raw_text?: string | null }>()
  for (let i = 0; i < scoped.length; i += 200) {
    const { data, error } = await sb.from('analysis_inputs').select('id, source_key, raw_text').in('id', scoped.slice(i, i + 200))
    if (error) return { ok: false, error: `내용 가드 조회 실패: ${error.message}` }
    for (const x of data ?? []) textById.set(x.id, x)
  }
  const guardDrop: GuardDrop = { github_issues: 0, short: 0, missing: 0, 'source-not-allowed': 0, 'dev-audience': 0 }
  const devAudience: Record<string, number> = {}
  const sourceOf = new Map<string, string>()
  const allow = opts.allow ?? null
  for (const id of scoped) {
    const x = textById.get(id) ?? {}
    let why: keyof GuardDrop | null = null
    if (!passesRrV2ContentGuard(x)) {
      // 사유 분류(통과 판정은 위 한 줄뿐 — 여기는 집계용 이름 붙이기).
      why = x.source_key == null || x.raw_text == null ? 'missing' : x.source_key === 'github_issues' ? 'github_issues' : 'short'
    } else if (allow !== null && !allow.has(String(x.source_key))) {
      why = 'source-not-allowed'
    } else {
      const dev = devAudienceReason(x.raw_text, x.source_key)
      if (dev) { why = 'dev-audience'; devAudience[dev] = (devAudience[dev] ?? 0) + 1 }
    }
    if (why === null) { sourceOf.set(id, String(x.source_key)); continue }
    guardDrop[why]++
    reasonOf.set(id, why)
  }
  const scopeExcluded = [...scope.excluded.values()].reduce<Record<string, number>>((m, x) => ({ ...m, [x]: (m[x] ?? 0) + 1 }), {})
  return { ok: true, reasonOf, sourceOf, scopeExcluded, guardDrop, devAudience }
}

export type PoolResult =
  | { ok: true; queried: number; agreed: number; scopeExcluded: Record<string, number>; guardDrop: GuardDrop; devAudience: Record<string, number>; allow: ReadonlySet<string> | null; targets: PoolRow[] }
  | { ok: false; error: string }

/**
 * 승인 대상 풀(읽기 전용) — relevance-auto-approve.mjs 의 실제 승인과 --gradual-dry 가 **같은 이 함수**를 쓴다.
 * 조건은 DB 쿼리와 isFullAgreement 두 번, 그다음 승인 가드(applyApprovalGuard — 영역·소비재·내용·소스 허용 목록·개발자 대상).
 * sources = AUTO_APPROVAL_SOURCES 원값(호출부가 process.env 를 그대로 넘긴다). 확인 불가면 DB 를 읽기 전에 ok:false(승인 0건).
 */
export async function loadApprovalPool(sb: Sb, since: Date, sources?: string | null): Promise<PoolResult> {
  const al = parseSourceAllowlist(sources)
  if (!al.ok) return { ok: false, error: `${al.error} — 승인하지 않는다` }
  const rows: VerdictRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from('review_relevance_verdicts')
      .select('input_id, verdict, second_verdict, product_informative, second_product_informative, human_verdict, judged_at, auto_approved_at')
      .eq('verdict', 'relevant').eq('second_verdict', 'relevant')
      .eq('product_informative', true).eq('second_product_informative', true)
      .is('human_verdict', null).is('auto_approved_at', null)
      .gte('judged_at', since.toISOString())
      .order('input_id').range(from, from + 999)
    if (error) return { ok: false, error: `대상 조회 실패: ${error.code ?? ''} ${error.message}` }
    rows.push(...data)
    if (data.length < 1000) break
  }
  const agreed = rows.filter((r) => isFullAgreement(r, since))
  const g = await applyApprovalGuard(sb, agreed.map((r) => r.input_id), { allow: al.allow })
  if (!g.ok) return { ok: false, error: `${g.error} — 승인하지 않는다` }
  const targets: PoolRow[] = agreed.filter((r) => !g.reasonOf.has(r.input_id)).map((r) => ({ ...r, source_key: g.sourceOf.get(r.input_id) as string }))
  return { ok: true, queried: rows.length, agreed: agreed.length, scopeExcluded: g.scopeExcluded, guardDrop: g.guardDrop, devAudience: g.devAudience, allow: al.allow, targets }
}

/**
 * 킬스위치 감사 창에서 빼는 가드 사유(v71dl 가). 승인 가드가 **확실히** 막는 넷만 뺀다.
 * 'missing'(글을 못 읽음)은 빼지 않는다 — 가드 통과 여부를 모르는 감사 오류를 창에서 지우면 킬스위치가 열리는 쪽으로 접힌다(§7.1).
 */
export const AUDIT_WINDOW_EXCLUDE: ReadonlySet<GuardReason> = new Set<GuardReason>(['out-area', 'consumer-tag', 'github_issues', 'short'])

export type AuditWindowResult =
  | { ok: true; audits: (AuditRow & { input_id: string })[]; read: number; excluded: Record<string, number> }
  | { ok: false; error: string; code?: string }

/**
 * 킬스위치 감사 창 입력(v71dl 가, 읽기 전용) — rr-v2 자동 승인 ∧ 사람 채점 행을 끝까지 읽고, **승인 가드(applyApprovalGuard)와 같은
 * 정의로** 가드 밖 행(AUDIT_WINDOW_EXCLUDE)을 뺀다. 창 50·문턱 8·워밍업은 그대로 killSwitch(audits, { now, since }) 가 계산한다.
 * 가드 표를 못 읽으면 ok:false — 호출부는 감사 조회 실패(게이트 닫힘)로 처리한다.
 */
export async function loadGuardedAuditWindow(sb: Sb): Promise<AuditWindowResult> {
  const rows: (AuditRow & { input_id: string })[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('review_relevance_verdicts')
      .select('input_id, human_verdict, human_product_informative, human_graded_at')
      .not('auto_approved_at', 'is', null)
      .eq('auto_approval_rule', AUTO_APPROVAL_RULE)
      .not('human_verdict', 'is', null)
      .order('input_id').range(from, from + 999)
    if (error) return { ok: false, error: `감사 창 조회 실패: ${error.code ?? ''} ${error.message}`, code: error.code }
    rows.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  const g = await applyApprovalGuard(sb, rows.map((r) => r.input_id))
  if (!g.ok) return { ok: false, error: `감사 창 가드 조회 실패: ${g.error}` }
  const excluded: Record<string, number> = {}
  const audits = rows.filter((r) => {
    const why = g.reasonOf.get(r.input_id)
    if (why && AUDIT_WINDOW_EXCLUDE.has(why)) { excluded[why] = (excluded[why] ?? 0) + 1; return false }
    return true
  })
  return { ok: true, audits, read: rows.length, excluded }
}
