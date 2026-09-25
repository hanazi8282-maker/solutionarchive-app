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
 * 하루 상한. 크레딧 기간 한시 상향(남헌 2026-09-25 결정 c): LLM_DAILY_BUDGET_BOOST_USD 를
 * LLM_DAILY_BUDGET_BOOST_UNTIL(YYYY-MM-DD, UTC 날짜 포함)까지만 쓰고, 그 다음 날부터는 코드·설정 변경 없이
 * 기본값(LLM_DAILY_BUDGET_USD, 기본 $5)으로 자동 복귀한다. 워크플로에 UNTIL=2026-11-05 로 박혀 있다.
 * 순수 함수라 selftest 가 날짜 경계를 고정한다(scripts/llm-provider-selftest.mjs).
 */
export function dailyBudgetFor(env: Record<string, string | undefined> = process.env, now = new Date()): number {
  const base = num(env.LLM_DAILY_BUDGET_USD, 5)
  const boost = num(env.LLM_DAILY_BUDGET_BOOST_USD, 0)
  const until = (env.LLM_DAILY_BUDGET_BOOST_UNTIL ?? '').trim()
  if (!(boost > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(until)) return base
  return now.toISOString().slice(0, 10) <= until ? Math.max(base, boost) : base
}
export const DAILY_BUDGET_USD = dailyBudgetFor()

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
  const req = requestStore.getStore()
  if (req) req.spentUsd += usd
}
