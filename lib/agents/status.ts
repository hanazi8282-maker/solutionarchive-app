// /agents 대시보드의 순수 로직. Supabase·React 의존 없음 — 셀프테스트가 이 파일만
// 확장자째 import 해서 고정한다(scripts/agents-status-selftest.mjs).
//
// ⚠️ 이 파일의 존재 이유는 세 상태를 섞지 않는 것이다 (CLAUDE.md §7.1):
//    OK(읽었고 있다) / EMPTY(읽었는데 0건) / UNAVAILABLE(못 읽었다).
//    UNAVAILABLE 을 EMPTY 로 접으면 "어젯밤 아무 일도 없었다"와
//    "어젯밤 상태를 못 읽는다"가 같은 화면이 된다.
//
// ⚠️ PostgREST 실측(2026-09-11, qmgrfqjfxqhxuufrnkwf): 없는 테이블에
//    `select('*', {count:'exact', head:true})` 를 치면 error=null · count=null 이
//    온다. 에러가 없다고 존재를 판정하면 안 된다 — count===null 도 UNAVAILABLE 이다.

export const STALE_MS = 5 * 60 * 1000

// ● 완료 / ◐ 진행중 / ○ 대기·건너뜀 / ✕ 실패 / ▲ 막힘 — scripts/status-render.mjs 와 같은 어휘
export const MARKS: Record<string, string> = {
  ok: '●', running: '◐', pending: '○', skipped: '○', failed: '✕', blocked: '▲',
}

export type LoopKey = 'cmo' | 'insight' | 'review' | 'notion'

export type LoopDef = {
  key: LoopKey
  label: string
  table: string
  cronExpr: string
  scheduleActive: boolean
  deptFilter?: string
  workflow: string
}

// cron 값은 .github/workflows/*.yml 이 정본이다. 셀프테스트가 두 값을 대조한다 —
// 워크플로에서 시각을 바꾸면 여기도 같이 고쳐야 테스트가 통과한다.
export const LOOPS: readonly LoopDef[] = [
  { key: 'cmo', label: 'CMO 데일리 루프', table: 'agent_runs', cronExpr: '17 20 * * *', scheduleActive: true, deptFilter: 'cmo', workflow: 'daily-cmo-loop.yml' },
  { key: 'insight', label: '나이틀리 인사이트 루프', table: 'insight_loop_runs', cronExpr: '41 18 * * *', scheduleActive: true, workflow: 'nightly-insight-loop.yml' },
  { key: 'review', label: '나이틀리 리뷰 수집', table: 'review_collection_runs', cronExpr: '37 17 * * *', scheduleActive: true, workflow: 'nightly-review-collect.yml' },
  { key: 'notion', label: '나이틀리 노션 피드백', table: 'notion_sync_log', cronExpr: '7 12 * * *', scheduleActive: true, workflow: 'nightly-notion-feedback.yml' },
] as const

export type State = 'OK' | 'EMPTY' | 'UNAVAILABLE'
export type UnavailableReason = 'table_missing' | 'env_missing' | 'query_failed'

export type Classified = {
  state: State
  reason: UnavailableReason | null
  detail: string | null
}

/** UNAVAILABLE 사유별 한국어 문구. EMPTY 문구와 절대 같은 문자열을 쓰지 않는다. */
export const UNAVAILABLE_TEXT: Record<UnavailableReason, string> = {
  table_missing: '확인 불가 — 테이블 없음(마이그레이션 미적용)',
  env_missing: '확인 불가 — Supabase 환경변수 미설정',
  query_failed: '확인 불가 — 조회 실패',
}

export const EMPTY_TEXT = '기록 0건 (조회는 정상이다 — 확인 불가가 아니다)'

/** 없는 테이블이면 PostgREST 가 PGRST205 / 42P01 을 준다. */
export function isMissingTableError(code?: string | null, message?: string | null): boolean {
  if (code === 'PGRST205' || code === '42P01') return true
  return /schema cache|does not exist|relation .* does not exist/i.test(message ?? '')
}

/**
 * 조회 결과 하나를 세 상태로 가른다.
 *
 * envMissing → UNAVAILABLE(env_missing). 에러 있으면 테이블 없음/그 외로 갈라
 * UNAVAILABLE. 에러가 없어도 rows 가 null 이면(=count head 트랩) UNAVAILABLE.
 * 여기까지 통과했는데 0건이면 그건 진짜 EMPTY 다.
 */
export function classify(input: {
  envMissing?: boolean
  error?: { code?: string | null; message?: string | null } | null
  rows?: unknown[] | null
  count?: number | null
}): Classified {
  if (input.envMissing) {
    return { state: 'UNAVAILABLE', reason: 'env_missing', detail: null }
  }
  if (input.error) {
    const missing = isMissingTableError(input.error.code, input.error.message)
    return {
      state: 'UNAVAILABLE',
      reason: missing ? 'table_missing' : 'query_failed',
      detail: truncate(`${input.error.code ?? ''} ${input.error.message ?? ''}`.trim()),
    }
  }
  const n = input.rows ? input.rows.length : input.count
  if (n === null || n === undefined) {
    // 에러 없이 건수도 없다. head:true 가 없는 테이블에 error=null 을 주는 경우가 이것이다.
    return { state: 'UNAVAILABLE', reason: 'table_missing', detail: '건수를 받지 못했다' }
  }
  return { state: n > 0 ? 'OK' : 'EMPTY', reason: null, detail: null }
}

export type Step = { status?: string | null; seq?: number | null }

/** 스텝 진행 기호 한 줄. 스텝이 없으면 빈 문자열 — 가짜 기호를 만들지 않는다. */
export function renderStepBar(steps: readonly Step[] | null | undefined): string {
  if (!steps || steps.length === 0) return ''
  return [...steps]
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
    .map((s) => MARKS[s.status ?? ''] ?? '?')
    .join('')
}

/**
 * running 인 채 5분 넘게 갱신이 없으면 stale. 죽었을 수 있다는 뜻이지
 * "돌고 있다"가 아니다. lastTouch 를 모르면(0) stale 판정을 하지 않는다.
 */
export function isStale(status: string | null | undefined, lastTouchMs: number, now: number = Date.now()): boolean {
  return status === 'running' && lastTouchMs > 0 && now - lastTouchMs > STALE_MS
}

export function staleMinutes(lastTouchMs: number, now: number = Date.now()): number {
  return Math.floor((now - lastTouchMs) / 60000)
}

/** error/detail jsonb 원문이 화면으로 통째로 새지 않게 자른다. */
export function truncate(s: unknown, max = 200): string {
  const t = typeof s === 'string' ? s : JSON.stringify(s) ?? String(s)
  if (!t) return ''
  return t.length > max ? `${t.slice(0, max)}…(${t.length}자 중 ${max}자)` : t
}

/** '17 20 * * *' → 'UTC 20:17 · KST 05:17'. 5필드가 아니면 원문을 그대로 돌려준다. */
export function cronToLabel(cron: string): string {
  const [m, h] = cron.trim().split(/\s+/)
  const hh = Number(h)
  const mm = Number(m)
  if (!Number.isInteger(hh) || !Number.isInteger(mm)) return cron
  const kst = (hh + 9) % 24
  const p = (n: number) => String(n).padStart(2, '0')
  return `UTC ${p(hh)}:${p(mm)} · KST ${p(kst)}:${p(mm)}`
}

// ── 노션 페이지 회수 ─────────────────────────────────────────────
// notion_sync_log 는 실행 로그가 아니라 페이지당 1행이다(아침 push INSERT → 밤 pull UPDATE).
// pulled_at NULL 을 "종료 안 된 실행"으로 그리면 멈춘 루프처럼 읽힌다.
//
// ⚠️ 밤 풀백(notion-pull-feedback.mjs)은 사람 피드백을 기다리지 않는다. 그 시각의
//    Notion 상태를 읽어 unchanged/edited/adopted/held 로 분류하고 pulled_at 을 채운다.
//    그래서 예정 풀백이 지났는데도 NULL 이면 "사람이 아직 안 봤다"가 아니라
//    풀백이 그 행을 못 끝낸 것이다(Notion 읽기 확인 불가 · DB 갱신 실패 · 워크플로 미실행).

/** GitHub Actions schedule 은 늦게 뜬다 — 2026-09-13 은 12:07 UTC 예정분이 16:07 에 커밋됐다(4시간). */
export const PULL_GRACE_MS = 6 * 60 * 60 * 1000

/** afterMs 이후 첫 일일 cron 발화 시각(UTC ms). 'm h * * *' 꼴이 아니면 null — 판정하지 않는다. */
export function nextDailyFire(cron: string, afterMs: number): number | null {
  const [m, h, dom, mon, dow] = cron.trim().split(/\s+/)
  const hh = Number(h)
  const mm = Number(m)
  if (!Number.isInteger(hh) || !Number.isInteger(mm) || dom !== '*' || mon !== '*' || dow !== '*') return null
  const d = new Date(afterMs)
  const fire = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hh, mm)
  return fire > afterMs ? fire : fire + 24 * 60 * 60 * 1000
}

/**
 * pulled_at NULL 인 페이지 1건의 상태.
 *   waiting — 푸시 뒤 첫 풀백(+유예)이 아직 안 지났다. 정상.
 *   overdue — 지났는데도 NULL. 확인 대상이다.
 *   unknown — 푸시 시각이나 cron 을 못 읽었다. waiting 으로 접지 않는다(§7.1).
 */
export function pullState(pushedMs: number, now: number, cron: string): 'waiting' | 'overdue' | 'unknown' {
  if (!pushedMs) return 'unknown'
  const fire = nextDailyFire(cron, pushedMs)
  if (fire === null) return 'unknown'
  return now > fire + PULL_GRACE_MS ? 'overdue' : 'waiting'
}

// ── 전일 대비 ────────────────────────────────────────────────────
// 이력 스냅샷 테이블이 없다. 기존 타임스탬프로 "어제 이 시각" 값을 되짚을 수 있는 지표만 쓴다.
// 되짚을 수 없는 지표는 변화를 **표시하지 않는다** — 0 이나 "변화 없음"으로 채우지 않는다(§7.1).

export const DAY_MS = 24 * 60 * 60 * 1000

/**
 * 실행 1건의 t 시점 상태. t 이후에 시작했으면 null(그때는 없던 실행).
 * t 이전에 끝났으면 최종 status, 아니면 running.
 * 전제: 러너는 finished_at 을 찍을 때 status 를 확정하고 그 뒤에 바꾸지 않는다
 * (review-collect 의 interrupted 정리도 finished_at 을 같이 찍는다).
 */
export function statusAt(run: { started_at?: string | null; finished_at?: string | null; status?: string | null }, t: number): string | null {
  const started = Date.parse(run.started_at ?? '')
  if (!started || started > t) return null
  const finished = Date.parse(run.finished_at ?? '')
  return finished && finished <= t ? (run.status ?? null) : 'running'
}

/** 전일 대비 문구. 어제 값을 모르면(null) null — 호출부는 칸을 숨긴다. */
export function deltaText(current: number, dayAgo: number | null): string | null {
  if (dayAgo === null) return null
  const d = current - dayAgo
  return d === 0 ? '어제 이 시각과 같음' : `어제 이 시각보다 ${d > 0 ? '+' : ''}${d}`
}
