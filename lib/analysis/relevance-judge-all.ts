// T2 전량 판정(남헌 결정: 원문 약 67,355건 전부 + 하루 신규 약 6,300건 따라잡기)의 순수 로직 + 저장 한 곳.
//   · fetchAllPages   — PostgREST 기본 1,000행 상한을 페이지로 넘는다(원문·판정 캐시 둘 다).
//   · orderForJudge   — 소스 라운드로빈(소스 안은 최신 먼저), 제외 소스(유튜브 — 제목 매핑 전) 빼고, 뒤로 미룰 소스(카카오 카페·블로그)는 맨 뒤.
//   · saveVerdictsInsertOnly — INSERT … ON CONFLICT DO NOTHING. 이미 있는 판정(사람 채점·1차·2차·자동 승인)을 절대 덮지 않는다.
//   · decideRelaunch  — 자기 호출 체인을 이어 갈지(종료 조건 한 벌).
//
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다. `@/` 별칭·enum 을 쓰지 않는다. 셀프테스트 scripts/relevance-judge-all-selftest.mjs.

export const PAGE_SIZE = 1000
/** 한 프로젝트에서 읽을 최대 행(무한 페이지 방지). 넘으면 truncated=true 로 알린다 — 조용히 자르지 않는다(§7.1). */
export const MAX_ROWS = 200_000

type PageResult<T> = { data: T[] | null; error: { code?: string; message: string } | null }

/**
 * makeQuery() 는 매번 새 쿼리 빌더를 돌려준다(정렬 포함 — 페이지가 겹치거나 빠지지 않게 고유 키로 정렬할 것).
 * 페이지 하나라도 실패하면 error 를 그대로 올린다(부분 결과를 "전부"로 쓰지 않는다).
 */
export async function fetchAllPages<T>(
   
  makeQuery: () => any,
  o: { pageSize?: number; maxRows?: number } = {},
): Promise<{ data: T[] | null; error: PageResult<T>['error']; pages: number; truncated: boolean }> {
  const size = o.pageSize ?? PAGE_SIZE
  const max = o.maxRows ?? MAX_ROWS
  const out: T[] = []
  let pages = 0
  for (let from = 0; from < max; from += size) {
    const { data, error } = (await makeQuery().range(from, from + size - 1)) as PageResult<T>
    pages += 1
    if (error) return { data: null, error, pages, truncated: false }
    out.push(...(data ?? []))
    if (!data || data.length < size) return { data: out, error: null, pages, truncated: false }
  }
  return { data: out, error: null, pages, truncated: true }
}

/** 판정에서 뺄 소스(기본 youtube — 영상 제목·제품 매핑이 생기기 전엔 판정이 헛돈다). env RELEVANCE_EXCLUDE_SOURCES(쉼표, 빈 문자열 = 없음). */
export const DEFAULT_EXCLUDED_SOURCES = ['youtube']
/** 맨 뒤로 미룰 소스(카카오 카페·블로그 — 잡글 비중이 커서 다른 소스를 먼저 채운다). env RELEVANCE_LAST_SOURCES. */
export const DEFAULT_LAST_SOURCES = ['kakao_cafe', 'kakao_blog']

/**
 * 제외 소스(fail-closed): 'none' 일 때만 전부 허용. 그 밖의 값은 기본 제외 목록에 **더한다**(합집합) —
 * 오타·부분 값이 기본값을 대체해 유튜브가 열리는 일이 없게. 알 수 없는 이름 경고는 호출부가 실제 원문 소스와 대조해 낸다.
 */
export const parseExcludedSources = (raw: string | undefined, defaults: readonly string[] = DEFAULT_EXCLUDED_SOURCES): string[] => {
  const v = (raw ?? '').trim()
  if (v.toLowerCase() === 'none') return []
  return [...new Set([...defaults, ...v.split(',').map((s) => s.trim()).filter(Boolean)])]
}

/** 뒤로 미룰 소스(순서만 바꾸므로 fail-open 위험 없음): undefined·빈 문자열 = 기본값, 'none' = 없음, 그 밖 = 쉼표 목록. */
export const parseSourceList = (raw: string | undefined, fallback: readonly string[]): string[] => {
  const v = (raw ?? '').trim()
  if (v === '') return [...fallback]
  if (v.toLowerCase() === 'none') return []
  return v.split(',').map((s) => s.trim()).filter(Boolean)
}

/**
 * 순서: 소스별로 묶어 각 소스 안은 최신(ts 큰 것) 먼저, 소스끼리는 한 건씩 번갈아(라운드로빈). 소스 순서는 이름순(결정적).
 * last 소스는 나머지를 다 꺼낸 뒤 같은 방식으로 뒤에 붙인다. excluded 소스는 뺀다. source 가 없으면 '(none)' 한 소스로 본다.
 */
export function orderForJudge<T>(
  items: readonly T[],
  o: { sourceOf: (it: T) => string | null | undefined; tsOf: (it: T) => number; excluded?: readonly string[]; last?: readonly string[] },
): { main: T[]; last: T[]; excludedCount: number } {
  const excluded = new Set(o.excluded ?? [])
  const lastSet = new Set(o.last ?? [])
  const groups = new Map<string, T[]>()
  let excludedCount = 0
  for (const it of items) {
    const s = o.sourceOf(it) ?? '(none)'
    if (excluded.has(s)) { excludedCount += 1; continue }
    const g = groups.get(s)
    if (g) g.push(it)
    else groups.set(s, [it])
  }
  const robin = (keys: string[]) => {
    const lists = keys.sort().map((k) => [...(groups.get(k) as T[])].sort((a, b) => o.tsOf(b) - o.tsOf(a)))
    const out: T[] = []
    for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (i < l.length) out.push(l[i])
    return out
  }
  const keys = [...groups.keys()]
  return { main: robin(keys.filter((k) => !lastSet.has(k))), last: robin(keys.filter((k) => lastSet.has(k))), excludedCount }
}

/**
 * 판정 저장 — 빈 칸만 채운다. ignoreDuplicates 가 PostgREST 에 `Prefer: resolution=ignore-duplicates`
 * (= INSERT … ON CONFLICT (input_id) DO NOTHING)를 보낸다. 이미 판정된 input_id 는 DB 가 건너뛴다 — 코드 쪽 거르기(pendingFor)가
 * 새도(경쟁 실행·조회 누락) 덮어쓰기가 구조적으로 안 난다.
 */
 
export function saveVerdictsInsertOnly(supabase: any, rows: readonly Record<string, unknown>[]) {
  // select: 실제로 새로 들어간 행만 돌아온다(건너뛴 중복은 안 온다) — 호출부가 "덮지 않고 건너뜀" 건수를 센다.
  return supabase.from('review_relevance_verdicts').upsert(rows, { onConflict: 'input_id', ignoreDuplicates: true }).select('input_id')
}

export type ColState = 'unknown' | 'present' | 'absent'
export type SaveCols = { promptVersion: ColState; info: ColState; labels: ColState }
type SaveRes = { data?: unknown; error?: { code?: string; message?: string } | null }

/**
 * 컬럼 없음(PGRST204·42703) 폴백 저장 — 오류 메시지가 가리키는 컬럼을 하나씩 빼며 다시 저장한다. 순서 무관:
 * prompt_version·product_informative 가 둘 다 없어도 각자 빠진다(예전엔 둘째 재시도가 라벨 분기로 새서 save_failed).
 * 라벨은 메시지로 못 가르는 옛 동작 그대로 "알려진 둘이 아니면 라벨" 로 본다. 각 컬럼은 한 번만 뺀다 → 재시도 최대 3회.
 * cols 를 제자리에서 바꾼다(호출부가 다음 묶음부터 그 필드를 안 싣는다).
 */
export async function saveWithColumnFallback(
  save: (rows: Record<string, unknown>[]) => Promise<SaveRes>,
  rows: readonly Record<string, unknown>[],
  cols: SaveCols,
  labelKeys: readonly string[],
  warn: (m: string) => void,
): Promise<SaveRes> {
  const absent = () => [...(cols.promptVersion === 'absent' ? ['prompt_version'] : []), ...(cols.info === 'absent' ? ['product_informative'] : []), ...(cols.labels === 'absent' ? labelKeys : [])]
  const without = () => rows.map((r) => Object.fromEntries(Object.entries(r).filter(([k]) => !absent().includes(k))))
  const missingCol = (e: SaveRes['error']) => !!e && (e.code === 'PGRST204' || e.code === '42703')
  let res = await save(without())
  while (missingCol(res.error)) {
    const msg = res.error?.message ?? ''
    const code = res.error?.code
    if (cols.promptVersion !== 'absent' && /prompt_version/.test(msg)) {
      cols.promptVersion = 'absent'
      warn(`prompt_version 미기록(마이그 미적용) — 컬럼이 없다(${code}). 20261014000020 적용 전까지 이 필드만 빼고 저장한다(model 은 기록).`)
    } else if (cols.info !== 'absent' && /product_informative/.test(msg)) {
      cols.info = 'absent'
      warn(`정보 판정 미기록(마이그 미적용) — product_informative 컬럼이 없다(${code}). 20260930000031 적용 전까지 이 필드만 빼고 저장한다. rr-v2 자동 승인 대상은 0건이 된다.`)
    } else if (cols.labels !== 'absent') {
      cols.labels = 'absent'
      warn(`라벨 미기록(마이그 미적용) — review_relevance_verdicts 에 라벨 컬럼이 없다(${code}). 20260930000014 적용 전까지 verdict·reason 만 저장한다.`)
    } else break // 더 뺄 것이 없다 — 오류 그대로 올린다
    res = await save(without())
  }
  return res
}

/** 체인을 멈추는 정지 사유. session_cap·deadline·null(끝까지)은 다음 실행으로 잇는다. */
export const CHAIN_STOP_REASONS = ['quota', 'weekly_stop', 'hard_cap', 'cost_unknown', 'guard_config', 'save_failed'] as const
export const CHAIN_MAX_ERROR_RATE = 0.05
export const CHAIN_DEFAULT_MAX_HOPS = 24
export const CHAIN_DEFAULT_ZERO_LIMIT = 2
/** 5시간 창이 안전선 이상이면 끊지 않고 이만큼 쉬었다가 부른다(분). */
export const CHAIN_WINDOW_WAIT_MIN = 90

export type RelaunchInput = {
  dry: boolean
  /** 리포 변수 RELEVANCE_CHAIN(기본 on). off 면 사람이 체인을 끈 것. */
  enabled: boolean
  now: Date
  /** config relevance_cap_until(ms). null = 체인 꺼짐. */
  untilMs: number | null
  stopReason: string | null
  /** 이번 실행에서 판정 시도한 건수(저장 성공 + 오류) — 오류율 분모. */
  attempted: number
  /** 호출 오류·저장 실패로 못 채운 건수. */
  errors: number
  judged: number
  /** 이번 실행 뒤 남은 미판정(확인 불가면 null). */
  remaining: number | null
  /** 이번 실행이 몇 번째 hop 인가(크론·수동 시작 = 0). */
  hop: number
  maxHops: number
  /** 직전까지 연속 0건 실행 수. */
  zeroStreak: number
  zeroLimit: number
  /** 이번 실행 포함 주간 사용률(하한)% · 안전선. pct null = 확인 불가. */
  weeklyPct: number | null
  weeklyStopPct: number | null
  /** 이번 실행 포함 5시간 창 사용률% · 안전선. */
  window5hPct: number | null
  window5hStopPct: number | null
}

export type RelaunchDecision = { relaunch: boolean; reason: string; nextHop: number; nextZeroStreak: number; waitMin: number }

/**
 * 체인 넘겨받기 — relaunch job 은 이미 대기 중인 실행(재시도 크론 r1·r2 등)이 있으면 부르지 않는다(대기 크론을 밀어내 취소시키지 않으려고).
 * 그 대기 실행이 재시도 할 일이 없을 때, 가장 최근에 끝난 판정 실행이 "이어 가라"(chain.relaunch=true)를 남겼으면 그 hop 을 이어받는다.
 * maxAgeMs 보다 오래된 표시는 무시한다(어제 끊긴 체인을 오늘 재시도 슬롯이 되살리지 않게).
 */
export function chainCarryOf(
  rows: readonly { run_key: string; status: string; summary?: Record<string, unknown> | null; started_at?: string | null; finished_at?: string | null }[],
  now: Date,
  maxAgeMs = 6 * 3_600_000,
): { hop: number; zero: number; from: string } | null {
  // 가장 최근 행만 본다. 그게 running(취소·timeout 으로 죽은 행 포함)이면 잇지 않는다 — 사람이 Cancel 한 실행 앞의 "이어 가라"를 되살리지 않게.
  const last = rows
    .filter((r) => r.run_key.startsWith('relevance-judge-'))
    .sort((a, b) => Date.parse(b.started_at ?? '') - Date.parse(a.started_at ?? ''))[0]
  if (!last || last.status === 'running') return null
  const c = (last.summary?.chain ?? null) as { relaunch?: unknown; next_hop?: unknown; next_zero_streak?: unknown } | null
  const fin = Date.parse(last.finished_at ?? '')
  if (!c || c.relaunch !== true || !Number.isFinite(fin) || now.getTime() - fin > maxAgeMs) return null
  if (typeof c.next_hop !== 'number' || typeof c.next_zero_streak !== 'number') return null
  return { hop: c.next_hop, zero: c.next_zero_streak, from: last.run_key }
}

/** 체인 종료 조건 한 벌. 위에서부터 첫 번째로 걸린 것이 사유다. 모르면(확인 불가) 멈춘다(§7.1). */
export function decideRelaunch(i: RelaunchInput): RelaunchDecision {
  const nextZeroStreak = i.judged === 0 ? i.zeroStreak + 1 : 0
  const nextHop = i.hop + 1
  const stop = (reason: string): RelaunchDecision => ({ relaunch: false, reason, nextHop, nextZeroStreak, waitMin: 0 })
  if (i.dry) return stop('드라이런')
  if (!i.enabled) return stop('리포 변수 RELEVANCE_CHAIN=off')
  if (i.untilMs == null) return stop('relevance_cap_until 없음(또는 못 읽음) — 체인 꺼짐')
  if (i.now.getTime() >= i.untilMs) return stop(`만료 — ${new Date(i.untilMs).toISOString()} 지남`)
  if (i.stopReason && (CHAIN_STOP_REASONS as readonly string[]).includes(i.stopReason)) return stop(`한도·오류 정지(${i.stopReason})`)
  const rate = i.attempted > 0 ? i.errors / i.attempted : 0
  if (rate > CHAIN_MAX_ERROR_RATE) return stop(`오류율 ${(rate * 100).toFixed(1)}% > ${CHAIN_MAX_ERROR_RATE * 100}%`)
  if (i.remaining == null) return stop('남은 미판정 확인 불가')
  if (i.remaining <= 0) return stop('미판정 0건 — 다 채웠다')
  if (nextZeroStreak >= i.zeroLimit) return stop(`연속 ${nextZeroStreak}회 처리 0건`)
  if (nextHop > i.maxHops) return stop(`체인 하나당 hop 상한 ${i.maxHops} 도달`)
  if (i.weeklyPct == null || i.weeklyStopPct == null) return stop('주간 사용률·안전선 확인 불가')
  if (i.weeklyPct >= i.weeklyStopPct) return stop(`주간 사용률(하한) ${i.weeklyPct}% ≥ 안전선 ${i.weeklyStopPct}%`)
  if (i.window5hPct == null || i.window5hStopPct == null) return stop('5시간 창 사용률·안전선 확인 불가')
  const waitMin = i.window5hPct >= i.window5hStopPct ? CHAIN_WINDOW_WAIT_MIN : 0
  return {
    relaunch: true,
    reason: `남은 ${i.remaining}건 — hop ${nextHop}/${i.maxHops}${waitMin ? ` · 5시간 창 ${i.window5hPct}% ≥ ${i.window5hStopPct}% 라 ${waitMin}분 쉬고 부른다` : ''}`,
    nextHop,
    nextZeroStreak,
    waitMin,
  }
}
