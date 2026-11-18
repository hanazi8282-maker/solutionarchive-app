// v71cu S2-1/S2-2/S5-4 — 빈 타깃 방문 간격·휴면·끄기 장치. 순수 함수만(네트워크·DB 없음). ⚠️ Node 타입 스트리핑으로 직접 로드: `@/` 별칭·enum 금지.
// 규칙: 연속 빈 횟수 n → 다음 방문 = 기준 간격 × 2^n (최대 14일). 연속 5회 이상 비고 30일 신규 0 → 휴면(월 1회, 끄기 아님). 글 한 편짜리(url:) 타깃은 다 받으면 바로 휴면.
// 수확률이 낮다는 이유로는 휴면시키지 않는다(남헌 11-19). status 는 건드리지 않는다.
export const BASE_INTERVAL_DAYS = 1
export const MAX_INTERVAL_DAYS = 14
export const DORMANT_EMPTY_MIN = 5
export const DORMANT_QUIET_DAYS = 30
export const DORMANT_REVISIT_DAYS = 30
export const DORMANT_DAILY_CAP = 200
const DAY = 86_400_000

export type VisitTarget = { id: string; source_key: string; product_ref: string; status: string; consecutive_empty: number | null; last_run_at: string | null; last_review_at: string | null; total_collected: number | null; dormant_at: string | null }
export type VisitPlan = { id: string; next_visit_at: string; dormant_at?: string; dormant_reason?: string; wake?: boolean }

export function intervalDays(empty: number): number { return Math.min(MAX_INTERVAL_DAYS, BASE_INTERVAL_DAYS * 2 ** Math.max(0, Math.min(empty, 10))) }

/** 실행 전 pre-step 이 부른다. 반환 = 쓸 칸만 담은 계획(호출자가 UPDATE). now 주입으로 테스트 가능. */
export function planVisits(rows: VisitTarget[], now = new Date(), opts: { dormantCap?: number } = {}): { plans: VisitPlan[]; dormantNew: number; skippedHalfRule: string[] } {
  const cap = opts.dormantCap ?? DORMANT_DAILY_CAP
  const plans: VisitPlan[] = []
  let dormantNew = 0
  const skipped: string[] = []
  const active = new Map<string, number>(); for (const r of rows) if (r.status === 'active') active.set(r.source_key, (active.get(r.source_key) ?? 0) + 1)
  const dormantBySrc = new Map<string, number>()
  for (const r of rows) {
    const empty = r.consecutive_empty ?? 0
    const last = r.last_run_at ? new Date(r.last_run_at).getTime() : null
    if (r.dormant_at) {
      if (empty === 0 && last) plans.push({ id: r.id, next_visit_at: new Date(last + intervalDays(0) * DAY).toISOString(), wake: true })
      continue
    }
    if (last == null) continue // 한 번도 안 돈 타깃은 그대로 앞에 선다
    const quiet = r.last_review_at ? (now.getTime() - new Date(r.last_review_at).getTime()) / DAY >= DORMANT_QUIET_DAYS : (r.total_collected ?? 0) === 0
    const oneShot = r.product_ref.startsWith('url:') && r.status === 'exhausted'
    if ((oneShot || (empty >= DORMANT_EMPTY_MIN && quiet)) && dormantNew < cap) {
      const n = (dormantBySrc.get(r.source_key) ?? 0) + 1
      // 한 소스의 활성 타깃이 절반 아래로 내려가는 휴면은 멈춘다.
      if (r.status === 'active' && n > Math.floor((active.get(r.source_key) ?? 0) / 2)) { skipped.push(r.source_key); continue }
      dormantBySrc.set(r.source_key, n); dormantNew++
      plans.push({ id: r.id, next_visit_at: new Date(last + DORMANT_REVISIT_DAYS * DAY).toISOString(), dormant_at: now.toISOString(), dormant_reason: oneShot ? 'one_shot_done' : `empty${empty}_quiet${DORMANT_QUIET_DAYS}d` })
      continue
    }
    if (empty > 0) plans.push({ id: r.id, next_visit_at: new Date(last + intervalDays(empty) * DAY).toISOString() })
  }
  return { plans, dormantNew, skippedHalfRule: [...new Set(skipped)] }
}

/** 끄기 장치(S5-4): 콤마로 나눈 묶음 이름. 빈 값이면 []. */
export function parseDisabledBatches(v: string | undefined | null): string[] { return String(v ?? '').split(',').map((s) => s.trim()).filter(Boolean) }

/** PostgREST `.or()` 두 개(AND 로 결합)를 만든다. 방문 시각 + 끄기 장치. */
export function visitFilters(env: Record<string, string | undefined>, now = new Date()): string[] {
  const out = [`next_visit_at.is.null,next_visit_at.lte.${now.toISOString()}`]
  const paused = String(env.COLLECT_NEW_SOURCES_PAUSED ?? '').toLowerCase() === 'true'
  const dis = parseDisabledBatches(env.COLLECT_ONBOARD_DISABLED_BATCHES)
  if (paused) out.push('onboard_batch.is.null')
  else if (dis.length) out.push(`onboard_batch.is.null,onboard_batch.not.in.(${dis.join(',')})`)
  return out
}
