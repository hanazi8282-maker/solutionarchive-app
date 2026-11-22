// rr-v2 점진 해제 장치(남헌 v71dc 확정) — 킬스위치가 풀려도 밀린 승인 대기(≈13,500건)가 한 번에 승인되지 않게 하루 상한을 단계로 건다.
//
// ⛔ 기본 꺼짐. 리포 변수 GRADUAL_RELEASE_ENABLED=true 일 때만 이 장치의 단계 규칙이 승인을 지배한다.
//    꺼져 있으면 **게이트가 열려도 승인 0건**이다(decideRelease) — 상한 없는 일괄 승인으로 돌아가는 경로는 없다.
// 킬스위치(auto-approval.ts autoApprovalGate·killSwitch·KILL·scoreApproval)는 건드리지 않는다. 이 장치는 그 뒤에서 **좁히기만** 한다.
//
// 단계 상태는 DB 에 저장하지 않는다(새 스키마 없음):
//   현재 단계   = 리포 변수 GRADUAL_RELEASE_STAGE(1~4) — 사람만 바꾼다. 그래서 "자동으로 안 올린다"가 구조로 보장된다.
//   단계 시작일 = 리포 변수 GRADUAL_RELEASE_STAGE_SINCE(KST YYYY-MM-DD) — 사람만 바꾼다.
//   오늘 승인 수 = review_relevance_verdicts(rr-v2 ∧ auto_approved_at 이 오늘 KST) — 하루 여러 슬롯(04·11·15시)을 합쳐 센다.
//   킬스위치 재걸림 = agent_run_steps(relevance-auto-approve 실행의 step 'gate' ∧ blocked, STAGE_SINCE 이후) — 있으면 유효 단계 1, 오늘이면 0건.
//   단계 내 멈춤 = 이 단계(STAGE_SINCE 이후) 승인 글의 사람 채점 오류 ≥ 5(scoreApproval 같은 정의) → 승인 0건. 이미 승인된 글은 취소하지 않는다.
// 무엇이든 못 읽거나 값이 이상하면 "확인 불가 → 승인 0건"(CLAUDE.md §7.1).
//
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다. `@/` 별칭·enum 을 쓰지 않는다. 셀프테스트 scripts/gradual-release-selftest.mjs.

import { AUTO_APPROVAL_RULE, isFullAgreement, passesRrV2ContentGuard, RR_V2_MIN_TEXT, scoreApproval } from './auto-approval.ts'
import type { AuditRow, VerdictRow } from './auto-approval.ts'
import { loadScope } from './approval-scope.ts'
import { rng } from './relevance-judge.ts'

export const GRADUAL = {
  /** 단계 → 하루 총 승인 상한(그날 이미 승인한 수 포함). 4단계(3단계 통과 후)는 상한 없음. */
  caps: { 1: 500, 2: 1500, 3: 2500, 4: Infinity } as Record<number, number>,
  /** 단계 통과 표본 크기(소스별 층화). */
  sampleSize: 30,
  /** 표본 오류가 이 이하이면 통과, 넘으면 멈춤. */
  maxErrors: 4,
} as const

/** 승인 실행 run_key 접두사 — scripts/relevance-auto-approve.mjs 의 runKey 와 같아야 한다(셀프테스트가 고정). */
export const APPROVE_RUN_PREFIX = 'relevance-auto-approve-'

export function isEnabled(v: string | null | undefined): boolean {
  return String(v ?? '').trim().toLowerCase() === 'true'
}

/** '1'~'4' 정수만. 그 밖은 null(확인 불가). */
export function parseStage(v: string | null | undefined): number | null {
  const s = String(v ?? '').trim()
  return /^[1-4]$/.test(s) ? Number(s) : null
}

/** 실제 달력 날짜인 YYYY-MM-DD 이고 오늘(KST) 이전·당일일 때만 그 문자열. 미래·형식 오류는 null. */
export function parseStageSince(v: string | null | undefined, todayKst: string): string | null {
  const s = String(v ?? '').trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  if (d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3]) return null
  return s <= todayKst ? s : null
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
  /** 아래 셋은 loadReleaseContext 결과. ok:false 면 확인 불가. */
  ctx: ReleaseContext | null
}

export type ReleaseContext =
  | { ok: true; approvedToday: number; trips: string[]; stageAudits: AuditRow[] }
  | { ok: false; error: string }

export interface ReleaseDecision {
  /** 이번 실행에서 승인해도 되는 최대 건수(0 = 승인 안 함). 4단계는 Infinity. */
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
  if (stage === null) return { ...base, limit: 0, reason: `GRADUAL_RELEASE_STAGE 확인 불가(${JSON.stringify(i.stage ?? null)}) — 1~4 정수가 아니라 승인 0건` }
  const since = parseStageSince(i.stageSince, i.todayKst)
  if (since === null) return { ...base, stage, limit: 0, reason: `GRADUAL_RELEASE_STAGE_SINCE 확인 불가(${JSON.stringify(i.stageSince ?? null)}) — 날짜가 아니거나 미래라 승인 0건` }
  if (!i.ctx || !i.ctx.ok) return { ...base, stage, limit: 0, reason: `단계 상태 조회 실패 — 확인 불가라 승인 0건: ${i.ctx && !i.ctx.ok ? i.ctx.error : '없음'}` }
  const { approvedToday, trips, stageAudits } = i.ctx
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

/** 최신(judged_at 내림차순) 우선 + 소스별 라운드 로빈으로 limit 건(순수). 소스 순서는 각 소스의 최신 글 시각 내림차순. */
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

export type StageJudgement = { state: 'pass' | 'stop' | 'insufficient'; scored: number; errors: number; reason: string }

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

/** 단계 판단에 필요한 DB 상태(읽기 전용). 하나라도 실패하면 ok:false(확인 불가). */
export async function loadReleaseContext(sb: Sb, opts: { stageSince: string; todayKst: string }): Promise<ReleaseContext> {
  const { start, end } = kstDayRange(opts.todayKst)
  const stageStart = kstDayRange(opts.stageSince).start
  const today = await readAll(() => sb.from('review_relevance_verdicts').select('input_id')
    .eq('auto_approval_rule', AUTO_APPROVAL_RULE).gte('auto_approved_at', start.toISOString()).lt('auto_approved_at', end.toISOString()).order('input_id'))
  if (today.error) return { ok: false, error: `오늘 승인 수 조회 실패: ${today.error.message}` }
  const runs = await readAll(() => sb.from('agent_runs').select('id').like('run_key', `${APPROVE_RUN_PREFIX}%`).gte('started_at', stageStart.toISOString()).order('id'))
  if (runs.error) return { ok: false, error: `agent_runs 조회 실패: ${runs.error.message}` }
  const trips: string[] = []
  const ids = runs.data.map((r) => r.id)
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await sb.from('agent_run_steps').select('run_id, updated_at').in('run_id', ids.slice(i, i + 200)).eq('step_key', 'gate').eq('status', 'blocked')
    if (error) return { ok: false, error: `agent_run_steps 조회 실패: ${error.message}` }
    for (const s of data ?? []) trips.push(String(s.updated_at ?? ''))
  }
  const audits = await readAll(() => sb.from('review_relevance_verdicts').select('human_verdict, human_product_informative, human_graded_at')
    .eq('auto_approval_rule', AUTO_APPROVAL_RULE).gte('auto_approved_at', stageStart.toISOString()).not('human_verdict', 'is', null).order('input_id'))
  if (audits.error) return { ok: false, error: `단계 감사 조회 실패: ${audits.error.message}` }
  return { ok: true, approvedToday: today.data.length, trips, stageAudits: audits.data }
}

export type PoolResult =
  | { ok: true; queried: number; agreed: number; scopeExcluded: Record<string, number>; guardDrop: { github_issues: number; short: number; missing: number }; targets: PoolRow[] }
  | { ok: false; error: string }

/**
 * 승인 대상 풀(읽기 전용) — relevance-auto-approve.mjs 의 실제 승인과 --gradual-dry 가 **같은 이 함수**를 쓴다.
 * 조건은 DB 쿼리와 isFullAgreement 두 번, 그다음 영역·소비재 제외(loadScope), 내용 가드(passesRrV2ContentGuard).
 */
export async function loadApprovalPool(sb: Sb, since: Date): Promise<PoolResult> {
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
  // L-20b: 영역 외(out-*)·소비재 태그 제외. 못 읽으면 승인 0건(§7.1).
  const scope = await loadScope(sb, agreed.map((r) => r.input_id))
  if (!scope.ok) return { ok: false, error: `영역·소비재 태그 조회 실패 — 승인하지 않는다: ${scope.error}` }
  const scoped = agreed.filter((r) => !scope.excluded.has(r.input_id))
  // v71cp P1-F: 내용 가드. 글을 못 읽으면 승인 0건(§7.1).
  const textById = new Map<string, { source_key?: string | null; raw_text?: string | null }>()
  for (let i = 0; i < scoped.length; i += 200) {
    const ids = scoped.slice(i, i + 200).map((r) => r.input_id)
    const { data, error } = await sb.from('analysis_inputs').select('id, source_key, raw_text').in('id', ids)
    if (error) return { ok: false, error: `내용 가드 조회 실패 — 승인하지 않는다: ${error.message}` }
    for (const x of data ?? []) textById.set(x.id, x)
  }
  const guardDrop = { github_issues: 0, short: 0, missing: 0 }
  const targets: PoolRow[] = []
  for (const r of scoped) {
    const x = textById.get(r.input_id) ?? {}
    if (passesRrV2ContentGuard(x)) { targets.push({ ...r, source_key: String(x.source_key) }); continue }
    if (x.source_key == null || x.raw_text == null) guardDrop.missing++
    else if (x.source_key === 'github_issues') guardDrop.github_issues++
    else if (x.raw_text.trim().length < RR_V2_MIN_TEXT) guardDrop.short++
  }
  const scopeExcluded = [...scope.excluded.values()].reduce<Record<string, number>>((m, x) => ({ ...m, [x]: (m[x] ?? 0) + 1 }), {})
  return { ok: true, queried: rows.length, agreed: agreed.length, scopeExcluded, guardDrop, targets }
}
