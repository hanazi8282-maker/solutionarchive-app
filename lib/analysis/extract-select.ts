// extract 입력 선별(T1) — **순수함수만 있다.** DB 조회는 호출부(extract-run.ts)가 한다.
//
// 왜 생겼나(2026-09-23, reports/2026-09-23/data-velocity-plan.md §2-T1):
//   예전에는 `created_at` 오름차순으로 12만 자를 채우고 뒤를 잘랐다. 리뷰가 수천 건
//   쌓인 프로젝트에서는 **가장 오래된 무관 댓글**만 읽고 나머지는 영영 안 읽혔다.
//   (실측: 입력 12,443건 → 속성 40개)
//   이제 페인 낱말·길이·최신성 점수순으로 상위를 채운다. LLM 0원, 결정적이다.
//
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다(CLI·셀프테스트). `@/` 별칭·enum 을 쓰지 않는다.

// 페인 낱말 사전은 처방 매칭과 같은 정본을 쓴다(config/pain-terms.json).
// 여기서 따로 배열을 만들면 SaaS 낱말로 교체할 때 한쪽만 바뀌어 조용히 갈라진다.
import { PAIN_TERMS } from '../cases/draft.ts'

// 컨텍스트 폭주 방지: 입력 1건당 / 전체 합계 상한
export const MAX_CHARS_PER_INPUT = 8000
export const MAX_CHARS_TOTAL = 120000

/** 선별에 필요한 필드만. DB 행 전체를 받아도 된다(초과 필드는 무시). */
export type SelectableInput = {
  raw_text?: string | null
  collected_at?: string | null
  created_at?: string | null
}

const DAY_MS = 86_400_000
/** 길이 밴드 — 이 범위 밖은 감산. 짧으면 "ㅋㅋ", 길면 본문 하나가 상한을 독식한다. */
const LENGTH_MIN = 80
const LENGTH_MAX = 2000
const OUT_OF_BAND = 0.5
/** 최신성 반감 기준 — 가장 새 입력보다 이만큼 오래되면 가중치가 절반이 된다. */
const RECENCY_HALF_DAYS = 30

/** 페인 낱말 히트 수 = 본문에 등장하는 **낱말 가짓수**(부분 문자열·소문자). */
export function painHits(text: string): number {
  const hay = text.toLowerCase()
  let hits = 0
  for (const term of PAIN_TERMS) if (hay.includes(term)) hits++
  return hits
}

/** 수집 시각 → epoch ms. 없거나 못 읽으면 0(= 가장 오래된 것으로 뒤로 민다, §7.1). */
export function timestampOf(input: SelectableInput): number {
  const raw = input.collected_at ?? input.created_at ?? null
  const t = raw ? Date.parse(raw) : NaN
  return Number.isFinite(t) ? t : 0
}

function lengthFactor(len: number): number {
  return len >= LENGTH_MIN && len <= LENGTH_MAX ? 1 : OUT_OF_BAND
}

/**
 * 최신성 가중 — `newest` 는 이 배치에서 가장 새 입력의 시각이다.
 * 현재 시각을 안 쓰는 이유: 같은 입력이면 언제 돌려도 같은 선택이 나와야 한다(결정적).
 */
function recencyFactor(ts: number, newest: number): number {
  if (newest <= 0) return 1
  const ageDays = Math.max(0, newest - ts) / DAY_MS
  return 1 / (1 + ageDays / RECENCY_HALF_DAYS)
}

/**
 * 점수 = (1 + 페인 히트) × 길이 밴드 × 최신성.
 * 히트에 1 을 더하는 이유: 히트 0 인 입력이 대다수인데 곱셈으로 0 을 만들면 길이·최신성이
 * 전부 죽어 사실상 무작위가 된다. 히트가 있는 쪽이 항상 앞서는 성질은 그대로다.
 */
export function scoreInput(text: string, ts: number, newest: number): number {
  return (1 + painHits(text)) * lengthFactor(text.length) * recencyFactor(ts, newest)
}

export type SelectedInput<T> = { input: T; text: string; score: number }
export type SelectionResult<T> = {
  selected: SelectedInput<T>[]
  /** 선별 밖으로 밀린 건수. 0건 추출과 "다 버렸다"를 가르는 숫자다(§7.1). */
  droppedInputs: number
  /** 실제로 프롬프트에 실린 글자 수. */
  usedChars: number
}

/**
 * 점수 상위부터 총량 상한까지 담는다. 상한을 넘기는 후보는 **건너뛰고** 다음 후보를 본다 —
 * 긴 글 하나가 뒤의 짧은 고득점 입력들을 통째로 막지 않게.
 * 동점은 최신 우선, 그래도 같으면 원래 순서(정렬 안정성).
 */
export function selectInputs<T extends SelectableInput>(
  inputs: readonly T[],
  opts: { maxCharsTotal?: number; maxCharsPerInput?: number } = {},
): SelectionResult<T> {
  const maxTotal = opts.maxCharsTotal ?? MAX_CHARS_TOTAL
  const maxPer = opts.maxCharsPerInput ?? MAX_CHARS_PER_INPUT

  const rows = inputs.map((input, index) => {
    const text = String(input.raw_text ?? '').slice(0, maxPer)
    return { input, index, text, ts: timestampOf(input) }
  })
  const newest = rows.reduce((max, r) => (r.ts > max ? r.ts : max), 0)

  const scored = rows
    // 폐기된 원문(purged_at 이 찍혀 raw_text 가 null)은 프롬프트에 실을 게 없다.
    .filter(r => r.text.length > 0)
    .map(r => ({ ...r, score: scoreInput(r.text, r.ts, newest) }))
    .sort((a, b) => b.score - a.score || b.ts - a.ts || a.index - b.index)

  const selected: SelectedInput<T>[] = []
  let usedChars = 0
  for (const r of scored) {
    if (usedChars + r.text.length > maxTotal) continue
    usedChars += r.text.length
    selected.push({ input: r.input, text: r.text, score: r.score })
  }

  return { selected, droppedInputs: inputs.length - selected.length, usedChars }
}
