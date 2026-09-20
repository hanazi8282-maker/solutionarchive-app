// 속성을 낳은 리뷰 원문 인용 — 정규화 + **원문 포함 검사** (docs/pmf-product-design.md §5).
//
// 왜 검사가 필요한가
//   모델에게 "원문 그대로 인용해라" 라고 시키면 대부분 그렇게 하지만, 가끔 매끄럽게 고쳐 쓰거나
//   아예 지어낸다. 지어낸 인용은 화면에서 **가장 믿음직해 보이는 자리**(판정 옆 근거)에 앉는다.
//   있지도 않은 리뷰 문장을 근거로 상세페이지를 쓰게 되는 경로라, 모델을 믿지 않고 저장 전에 건다.
//
// 어떻게 거는가: 인용문의 **앞 20자**가 입력 원문 중 하나에 글자 그대로 있는지 본다.
//   - 전문 일치를 요구하지 않는 이유: 모델이 끝의 조사·마침표를 다듬는 일이 흔한데, 그것까지
//     떨어뜨리면 멀쩡한 인용이 대부분 죽는다.
//   - 앞 20자로 충분한 이유: 지어낸 문장이 앞머리 20자까지 원문과 우연히 같을 확률은 실질적으로 0이다.
//   - 통과 못 한 인용은 **버린다.** 경고만 달고 보여주면 화면에 남고, 화면에 남으면 읽힌다.
//
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다. `@/` 별칭·enum 을 쓰지 않는다.

export const QUOTE_MAX_CHARS = 300
export const QUOTE_MAX_COUNT = 3
/** 원문 대조에 쓰는 앞머리 길이. 짧은 인용은 전체를 본다. */
export const QUOTE_PREFIX_CHARS = 20

export interface EvidenceQuote {
  text: string
  source_type: string
}

export interface QuoteSource {
  source_type?: string | null
  raw_text?: string | null
}

/** 공백 차이로 멀쩡한 인용이 떨어지지 않게 한다. 글자 자체는 바꾸지 않는다. */
function squash(s: string): string {
  return s.replace(/\s+/g, ' ').trim()
}

/**
 * LLM 이 준 인용 배열 → 저장할 `[{ text, source_type }]`.
 *
 * - 문자열 배열과 `{text}` 객체 배열을 둘 다 받는다(모델이 어느 쪽으로든 낸다).
 * - 각 300자 상한, 최대 3건.
 * - 앞 20자가 입력 원문 어디에도 없으면 **버린다**.
 * - source_type 은 그 인용이 실제로 들어 있던 입력의 것을 쓴다(없으면 'review').
 */
export function normalizeEvidenceQuotes(raw: unknown, inputs: QuoteSource[] | null | undefined): EvidenceQuote[] {
  if (!Array.isArray(raw)) return []
  const haystacks = (inputs ?? []).map((i) => ({
    source_type: typeof i?.source_type === 'string' && i.source_type ? i.source_type : 'review',
    text: squash(String(i?.raw_text ?? '')),
  }))

  const out: EvidenceQuote[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    const rawText = typeof item === 'string'
      ? item
      : typeof (item as { text?: unknown })?.text === 'string' ? (item as { text: string }).text : ''
    const text = squash(rawText).slice(0, QUOTE_MAX_CHARS)
    if (text.length < 2 || seen.has(text)) continue

    const probe = text.slice(0, QUOTE_PREFIX_CHARS)
    const hit = haystacks.find((h) => h.text.includes(probe))
    if (!hit) continue // 원문에 없는 인용 — 지어낸 것으로 보고 버린다

    seen.add(text)
    out.push({ text, source_type: hit.source_type })
    if (out.length >= QUOTE_MAX_COUNT) break
  }
  return out
}
