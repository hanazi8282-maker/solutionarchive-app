// Gemini/Anthropic 호출의 정량 가드레일 (진단 1-3).
//
// 진단이 지적한 것은 "재시도 예산이 함수 상한을 넘어 쿼터만 태우고 산출물 0" 이었다.
// 재시도 횟수를 줄이는 것만으로는 반쪽이다 — **얼마를 쓰면 멈출지**가 코드 어디에도
// 없었기 때문이다. 그래서 두 개의 숫자 상한을 둔다. 로그만 남기지 않는다. 막는다.
//
//   1. 요청당 상한 (LLM_REQUEST_BUDGET_USD, 기본 0.50) — 한 HTTP 요청(앵글 1배치,
//      추출 1건) 안에서 누적 추정 비용이 이 값을 넘으면 다음 호출을 하지 않고 던진다.
//   2. 하루 상한 (LLM_DAILY_BUDGET_USD, 기본 5.00) — UTC 날짜가 바뀌면 리셋.
//
// ⚠️ 두 상한 모두 **추정치** 기준이다. 실제 청구액이 아니다.
//    - 토큰 수: 한국어는 1토큰이 1~1.5자 수준이라 보수적으로 2자=1토큰으로 센다(과대추정).
//    - 단가: 기본값은 보수적 상한이고 실제 값은 Gemini 콘솔에서 확인해 env 로 덮어쓴다.
//      (근거 없는 숫자를 정본처럼 박지 않는다 — _principles.md §4)
//    과대추정 방향이라 "덜 막는" 쪽으로 틀리지 않는다.
//
// ponytail: 하루 상한은 **프로세스(서버리스 인스턴스) 단위**다. 인스턴스가 여러 개면
//   각자 5달러까지 쓸 수 있다. 진짜 계정 단위 상한이 필요해지면 DB 원장 테이블 1개
//   (마이그레이션 = 사람 적용)로 올린다. 지금 이 파이프라인은 사람이 버튼을 눌러야
//   도는 경로뿐이라 인스턴스 단위로도 폭주는 막힌다.

import { AsyncLocalStorage } from 'node:async_hooks'

/** 예산을 넘겨 호출을 거부했을 때. 재시도해도 같으므로 호출부는 즉시 실패로 처리한다. */
export class LlmBudgetExceededError extends Error {}

// ── 시간 예산 (재시도) ───────────────────────────────────────────
// 비용 예산과 같은 파일에 두는 이유: 이 둘이 함께 "한 요청이 얼마나 쓸 수 있나"를 정한다.
// (그리고 llm.ts 는 확장자 없는 import 가 있어 순수 node 셀프테스트가 불러올 수 없다.)

export const MAX_ATTEMPTS = 4
/**
 * 429 만 따로 2회(=재시도 1회)로 줄인다 (진단 1-3).
 *
 * 예전: 모델당 4회(20+40+80초 대기) × 모델 5개 = 최악 20요청·약 700초.
 * 함수 상한은 300초(maxDuration)라 **반드시 실패할 재시도를 다 태우고 저장 전에 죽었다.**
 * 쿼터는 다 쓰고 산출물은 0 — CLAUDE.md §7.2 의 정확한 사례.
 * 지금: 모델당 2회(20초 1회 대기) × 5개 = 최악 100초 대기. 300초 안에 끝나 결과가 저장된다.
 * 429 가 두 번 연속이면 분당 한도가 아니라 일일 한도로 보고 다음 모델로 넘기는 게 맞다.
 */
const MAX_ATTEMPTS_RATE_LIMIT = 2
// 5xx(일시 과부하)는 금방 풀리지만, 429 는 분당 요청 한도라 1분 창이 지나야 한다.
const BASE_BACKOFF_MS = 1500
const RATE_LIMIT_BACKOFF_MS = 20_000

/** 이 상태코드로 실패했을 때 허용할 총 시도 횟수. */
export function attemptsFor(status: number): number {
  return status === 429 ? MAX_ATTEMPTS_RATE_LIMIT : MAX_ATTEMPTS
}

/** 지수 백오프(지터 제외 — 지터는 호출부에서 더한다. 최악값을 계산할 수 있어야 하므로). */
export function backoffFor(status: number, attempt: number): number {
  const base = status === 429 ? RATE_LIMIT_BACKOFF_MS : BASE_BACKOFF_MS
  return base * 2 ** (attempt - 1)
}

/** 모델 체인 전체를 돌 때의 최악 대기 시간(ms). 함수 상한(maxDuration 300초)과 대조용. */
export function worstCaseWaitMs(status: number, models: number): number {
  let perModel = 0
  for (let a = 1; a < attemptsFor(status); a++) perModel += backoffFor(status, a)
  return perModel * models
}

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/** 100만 토큰당 달러. 기본값은 보수적 추정치 — 실단가는 env 로 덮어쓴다. */
export const USD_PER_MTOK_IN = num(process.env.LLM_USD_PER_MTOK_IN, 0.5)
export const USD_PER_MTOK_OUT = num(process.env.LLM_USD_PER_MTOK_OUT, 4)
export const REQUEST_BUDGET_USD = num(process.env.LLM_REQUEST_BUDGET_USD, 0.5)
/**
 * 하루 상한(LLM_DAILY_BUDGET_USD, 기본 $5). 청구되는 프로바이더(gemini·anthropic)에만 적용된다 —
 * claude-cli 는 llm.ts UNMETERED 로 이 예산을 타지 않는다.
 * 2026-09-25~29 에 있던 "크레딧 기간 한시 상향"(BOOST_USD/BOOST_UNTIL=2026-11-05)은 뺐다: 전제였던 $250 크레딧이
 * claude -p 경로와 무관하다고 09-26 에 정정됐고(claude/agent-sdk-credit-2026-11-05.md), 그 경로는 이제 예산 밖이다.
 */
export function dailyBudgetFor(env: Record<string, string | undefined> = process.env): number {
  return num(env.LLM_DAILY_BUDGET_USD, 5)
}
export const DAILY_BUDGET_USD = dailyBudgetFor()

// ── 판정 과금 상한(v71cu-3 §2a) — 일 $75 · 월 $2,000 ─────────────────
// 위 하루 상한은 **프로세스 단위**라 크론 슬롯·체인 hop 마다 다시 0 에서 시작한다(하루 3슬롯 + hop 24 면 이론상 $15 × 27).
// 그래서 판정 스크립트(1차·2차)는 시작 때 agent_runs 원장(summary.est_usd)으로 오늘·이번 달 과금 추정 합을 읽고,
// 남은 몫을 이 프로세스의 상한으로 건다(setRunCapUsd). 넘으면 reserveOrThrow 가 던진다 — 2차는 callGeminiRotating 이 stop 으로 받는다.
//   · 계량 = 과금 경로(gemini·anthropic). claude-cli(구독 OAuth)는 청구가 없어 이 상한에 넣지 않고 '계량 불가'로 표시만 한다.
//   · 날짜 경계는 KST(일일 상태 로그·reports 와 같은 날짜). 금액은 budget.ts 추정치 기준이다(실청구 아님, 과대추정 방향).
//   · 끝나지 않은 실행(죽어서 est_usd 가 없는 행)은 0 으로 접지 않는다 — 한 프로세스가 쓸 수 있는 최대치(LLM_DAILY_BUDGET_USD)로 센다.

/** 일·월 상한(리포 변수 JUDGE_DAILY_USD_CAP · JUDGE_MONTHLY_USD_CAP). 비거나 잘못된 값이면 지시값 75·2000. */
export function judgeUsdCaps(env: Record<string, string | undefined> = process.env): { dailyUsd: number; monthlyUsd: number } {
  return { dailyUsd: num(env.JUDGE_DAILY_USD_CAP, 75), monthlyUsd: num(env.JUDGE_MONTHLY_USD_CAP, 2000) }
}

/** 판정 실행 run_key 접두어 — 원장 합산 대상. */
export const JUDGE_RUN_PREFIXES = ['relevance-judge-', 'relevance-second-'] as const

type LedgerRow = { run_key: string; status?: string | null; summary?: { est_usd?: unknown } | null; started_at?: string | null }
export type JudgeLedger = { todayUsd: number; monthUsd: number; openToday: number; openMonth: number }

const KST_MS = 9 * 3_600_000
/** KST 기준 오늘 0시·이번 달 1일 0시(UTC Date). */
export function kstBounds(now: Date): { dayStart: Date; monthStart: Date } {
  const k = new Date(now.getTime() + KST_MS)
  const dayStart = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()) - KST_MS)
  const monthStart = new Date(Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), 1) - KST_MS)
  return { dayStart, monthStart }
}

/**
 * 원장 행 → 오늘·이번 달 합. est_usd 가 숫자가 아닌 행(실행 중이거나 죽은 실행)은 openUpperUsd 로 센다(0 으로 접지 않는다, §7.1).
 * ponytail: 지금 도는 자기 자신의 행도 open 으로 잡힐 수 있다 — 호출부는 자기 run_key 를 빼고 넘긴다.
 */
export function judgeLedgerFrom(rows: readonly LedgerRow[], now: Date, openUpperUsd: number): JudgeLedger {
  const { dayStart, monthStart } = kstBounds(now)
  const out = { todayUsd: 0, monthUsd: 0, openToday: 0, openMonth: 0 }
  for (const r of rows) {
    if (!JUDGE_RUN_PREFIXES.some(p => r.run_key.startsWith(p))) continue
    const at = Date.parse(r.started_at ?? '')
    if (!Number.isFinite(at) || at < monthStart.getTime()) continue
    const est = Number(r.summary?.est_usd)
    // 끝난 실행(status ≠ running)인데 est_usd 가 없으면 LLM 호출 전에 나간 경로(가드·주간 정지·대상 0)다 — 두 스크립트의 LLM 경로는 전부 est_usd 를 남긴다.
    const finishedBeforeLlm = r.summary?.est_usd == null && r.status != null && r.status !== 'running'
    const known = finishedBeforeLlm || (r.summary?.est_usd != null && Number.isFinite(est))
    const usd = finishedBeforeLlm ? 0 : known ? est : openUpperUsd
    out.monthUsd += usd
    if (!known) out.openMonth += 1
    if (at >= dayStart.getTime()) {
      out.todayUsd += usd
      if (!known) out.openToday += 1
    }
  }
  out.todayUsd = Number(out.todayUsd.toFixed(4))
  out.monthUsd = Number(out.monthUsd.toFixed(4))
  return out
}

/** 원장 조회 — 이번 달(KST) 판정 실행 전부. 실패는 null(호출부가 '확인 불가'로 멈춘다). */
export async function loadJudgeLedgerRows(supabase: { from: (t: string) => any }, now: Date, excludeRunKey?: string): Promise<LedgerRow[] | null> {
  const { monthStart } = kstBounds(now)
  const out: LedgerRow[] = []
  for (let from = 0; from < 20_000; from += 1000) {
    const { data, error } = await supabase.from('agent_runs')
      .select('run_key, status, summary, started_at')
      .gte('started_at', monthStart.toISOString())
      .or(JUDGE_RUN_PREFIXES.map(p => `run_key.like.${p}*`).join(','))
      .order('started_at', { ascending: true })
      .range(from, from + 999)
    if (error) return null
    out.push(...(data ?? []))
    if (!data || data.length < 1000) return out.filter(r => r.run_key !== excludeRunKey)
  }
  return null // 2만 행을 넘으면 다 못 읽은 것 — 확인 불가
}

export type JudgeBudgetGate =
  | { metered: false; stop: false; capUsd: null; line: string }
  | { metered: true; stop: boolean; capUsd: number; line: string }

/**
 * 이번 실행이 쓸 수 있는 과금 몫. metered=false(구독 경로)면 상한을 걸지 않고 '계량 불가'만 남긴다.
 * metered 인데 원장을 못 읽으면(null) 멈춘다 — 모르는 채 돈을 쓰지 않는다(§7.1).
 */
export function judgeBudgetGate(i: { metered: boolean; caps: { dailyUsd: number; monthlyUsd: number }; ledger: JudgeLedger | null }): JudgeBudgetGate {
  const { dailyUsd, monthlyUsd } = i.caps
  if (!i.metered) return { metered: false, stop: false, capUsd: null, line: `과금 상한 — 계량 불가(구독 경로 claude-cli, 청구 없음 · 일 $${dailyUsd}/월 $${monthlyUsd} 미적용)` }
  if (!i.ledger) return { metered: true, stop: true, capUsd: 0, line: `과금 상한 — 원장(agent_runs) 조회 실패, 오늘·이번 달 사용액 확인 불가라 멈춘다(일 $${dailyUsd}/월 $${monthlyUsd})` }
  const l = i.ledger
  const left = Math.max(0, Math.min(dailyUsd - l.todayUsd, monthlyUsd - l.monthUsd))
  const open = l.openMonth > 0 ? ` · 끝나지 않은 실행 ${l.openMonth}건(오늘 ${l.openToday})은 상한치로 셈` : ''
  const line = `과금 상한 — 오늘 추정 $${l.todayUsd.toFixed(2)}/$${dailyUsd} · 이번 달 $${l.monthUsd.toFixed(2)}/$${monthlyUsd} · 이번 실행 몫 $${left.toFixed(2)}${open}`
  return { metered: true, stop: left <= 0, capUsd: Number(left.toFixed(4)), line: left <= 0 ? `${line} — 상한 도달, 멈춘다` : line }
}

/** 이 프로세스의 추가 상한(판정 원장의 남은 몫). 기본 무한 = 기존 동작. */
let runCapUsd = Number.POSITIVE_INFINITY
/** 이 프로세스 누적(UTC 날짜가 바뀌어도 리셋하지 않는다 — 원장 몫은 실행 단위). */
let runUsd = 0
export function setRunCapUsd(usd: number): void {
  runCapUsd = usd
}

/** 한 호출에 얹어 볼 기본 출력 예상치(토큰). judge 는 100토큰대, 추출은 수천 토큰이다. */
const ASSUMED_OUTPUT_TOKENS = 1500

/** 보수적 토큰 환산 — 한국어 기준 2자 = 1토큰. */
export function tokensOf(chars: number): number {
  return Math.ceil(chars / 2)
}

export function usdFor(inputChars: number, outputTokens: number): number {
  return (tokensOf(inputChars) * USD_PER_MTOK_IN + outputTokens * USD_PER_MTOK_OUT) / 1_000_000
}

export type BudgetState = { spentUsd: number; calls: number }

const requestStore = new AsyncLocalStorage<BudgetState>()

/** 프로세스 단위 하루 누적. UTC 날짜가 바뀌면 리셋한다. */
const daily = { day: '', usd: 0, calls: 0 }

function today(now: Date): string {
  return now.toISOString().slice(0, 10)
}

/** 테스트·운영 리셋용. */
export function resetDaily(now = new Date()): void {
  daily.day = today(now)
  daily.usd = 0
  daily.calls = 0
}

export function dailySpent(now = new Date()): BudgetState {
  if (daily.day !== today(now)) return { spentUsd: 0, calls: 0 }
  return { spentUsd: daily.usd, calls: daily.calls }
}

/** 현재 요청의 누적. 예산 컨텍스트 밖이면 null(= 요청 상한 미적용, 하루 상한만). */
export function requestSpent(): BudgetState | null {
  return requestStore.getStore() ?? null
}

/**
 * 한 요청(HTTP 핸들러 1회) 동안의 예산 컨텍스트. 이 안에서 일어난 모든 LLM 호출이
 * 한 지갑을 쓴다. 감싸지 않으면 요청당 상한이 적용되지 않으므로 LLM 을 부르는
 * 진입점은 전부 감싼다(analyze/angle POST, analyze/extract 의 백그라운드 작업).
 */
export function withLlmBudget<T>(fn: () => Promise<T>): Promise<T> {
  return requestStore.run({ spentUsd: 0, calls: 0 }, fn)
}

/**
 * 호출 **전에** 부른다. 이번 호출의 추정 비용을 더했을 때 상한을 넘으면 던진다.
 * 넘지 않으면 추정 입력 비용을 미리 적립하고(호출이 실패해도 입력 토큰은 과금되므로),
 * 나중에 chargeOutput 으로 실제 출력분을 더한다.
 */
export function reserveOrThrow(label: string, inputChars: number, now = new Date()): number {
  const est = usdFor(inputChars, ASSUMED_OUTPUT_TOKENS)

  if (daily.day !== today(now)) resetDaily(now)
  if (runUsd + est > runCapUsd) {
    throw new LlmBudgetExceededError(
      `판정 과금 상한(일 JUDGE_DAILY_USD_CAP·월 JUDGE_MONTHLY_USD_CAP)의 남은 몫을 넘었습니다 (${label}: 이번 실행 추정 $${runUsd.toFixed(3)} + 이번 $${est.toFixed(3)} > 남은 몫 $${runCapUsd.toFixed(3)}).`,
    )
  }
  if (daily.usd + est > DAILY_BUDGET_USD) {
    throw new LlmBudgetExceededError(
      `LLM 하루 예산을 넘었습니다 (${label}: 오늘 추정 $${daily.usd.toFixed(3)} + 이번 $${est.toFixed(3)} > 상한 $${DAILY_BUDGET_USD}). LLM_DAILY_BUDGET_USD 로 조정합니다.`,
    )
  }

  const req = requestStore.getStore()
  if (req && req.spentUsd + est > REQUEST_BUDGET_USD) {
    throw new LlmBudgetExceededError(
      `LLM 요청 예산을 넘었습니다 (${label}: 이번 요청 추정 $${req.spentUsd.toFixed(3)} + 이번 $${est.toFixed(3)} > 상한 $${REQUEST_BUDGET_USD}, 호출 ${req.calls}회). LLM_REQUEST_BUDGET_USD 로 조정합니다.`,
    )
  }

  const inputOnly = usdFor(inputChars, 0)
  daily.usd += inputOnly
  runUsd += inputOnly
  daily.calls += 1
  if (req) {
    req.spentUsd += inputOnly
    req.calls += 1
  }
  return est
}

/** 호출 **후에** 부른다. 실제 출력 길이만큼 적립한다. */
export function chargeOutput(outputChars: number): void {
  const usd = usdFor(0, tokensOf(outputChars))
  daily.usd += usd
  runUsd += usd
  const req = requestStore.getStore()
  if (req) req.spentUsd += usd
}
