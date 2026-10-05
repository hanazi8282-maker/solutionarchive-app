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

/** **저장** 상한(내부 정본 evidence_quotes). 고객 화면 상한이 아니다 — 그건 checkQuote(QUOTE_MAX_KO·EN). */
export const QUOTE_MAX_CHARS = 300
export const QUOTE_MAX_COUNT = 3
/** 원문 대조에 쓰는 앞머리 길이. 짧은 인용은 전체를 본다. */
export const QUOTE_PREFIX_CHARS = 20

export interface EvidenceQuote {
  text: string
  source_type: string
  /**
   * 인용이 실제로 들어 있던 입력의 review_sources.key(2026-10-05~). 고객 화면이 quote_allowed 로 거를 때 쓴다(D안).
   * 이 날 이전에 저장된 인용에는 없다 — 없으면 "허용 확인 불가"로 보고 고객 화면에 내지 않는다(publicQuotes).
   */
  source_key?: string
}

export interface QuoteSource {
  source_type?: string | null
  source_key?: string | null
  raw_text?: string | null
}

/**
 * review_sources.quote_policy(마이그 20261005000003, 남헌 v19 A).
 *  - full       : 고객 화면 인용 가능. 출처 이름·링크는 D안대로 어차피 비표시.
 *  - short_only : 고객 화면 인용 가능 + 소스 이름·링크·작성자 비표시(publicQuotes 가 source_key 를 뗀다).
 *  - none       : 인용 불가.
 * 길이·문장 상한은 v20 #5 부터 full·short_only 공통이다(checkQuote) — 옛 full 300자·short_only 140자는 없앴다.
 * 내부 DB 는 정책과 무관하게 출처·원문 주소를 보존한다(analysis_inputs.source_key·source_url·raw_text).
 */
export type QuotePolicy = 'full' | 'short_only' | 'none'

/** DB 값 → 정책. 모르는 값·NULL·못 읽음은 'none'(§7.1 — 확인 불가를 허용으로 접지 않는다). */
export function quotePolicyOf(v: unknown): QuotePolicy {
  return v === 'full' || v === 'short_only' ? v : 'none'
}

/**
 * 고객 화면 인용 상한(남헌 v20 #5, 2026-10-05) — full·short_only 공통. **한 문장 이내 ∧ 글자 상한 이내, 둘 다.**
 * 넘으면 인용으로 쓰지 않는다(빈 값 → 호출부가 요약·통계로 대체). 문장 중간을 잘라 붙이지 않는다
 * (옛 동작 "첫 문장을 N자에서 자르기"는 v20 에서 없앴다 — 잘린 문장은 원문이 아니다).
 * 글자 수는 코드포인트(Array.from) 기준, 공백은 한 칸으로 눕힌 뒤 센다.
 */
export const QUOTE_MAX_KO = 100
export const QUOTE_MAX_EN = 200

/**
 * 언어 판정 — 글자(한글 음절·자모 + 라틴 문자) 중 한글 비중. 결정적이고 사전·모델이 없다.
 *  - 한글 ≥ 10% → 'ko'. 한국어 리뷰는 영어 제품명이 섞여도("AirPods 배터리가 금방 닳아요") 한글 비중이 훨씬 높다.
 *    10% 미만은 영어 문장에 한글 낱말 하나가 낀 정도라 'en'.
 *  - 글자가 하나도 없음(숫자·이모지·한자·가나뿐) → 'unknown' → 더 엄격한 100자를 쓴다.
 */
export function quoteLang(text: string): 'ko' | 'en' | 'unknown' {
  const ko = (text.match(/[ᄀ-ᇿ㄰-㆏가-힣]/g) ?? []).length
  const en = (text.match(/[A-Za-z]/g) ?? []).length
  if (ko + en === 0) return 'unknown'
  return ko / (ko + en) >= 0.1 ? 'ko' : 'en'
}

/**
 * 한 문장인가. 줄바꿈이 있거나, 문장부호(. ! ? … 。！？) 뒤에 공백·한글이 오고 그 뒤에 글이 더 있으면 두 문장 이상이다.
 * 끝에 붙은 부호("정말요?!", "...")는 괜찮다. "좋다.그런데"처럼 한국어 종결 뒤에 띄어쓰기 없이 이어 쓴 것도 잡는다
 * (부호 뒤 한글). 6.1 같은 소수점·a.b.com 같은 주소는 부호 뒤가 숫자·라틴이라 경계로 보지 않는다.
 * ponytail: 알려진 한계 — 약어("e.g. this", "Mr. Kim")·말줄임("음... 좋아요")·인용 속 마침표는 경계로 보여
 *   두 문장으로 거부된다. 안전한 쪽(인용을 덜 낸다)이라 그대로 둔다. 부호 없이 이어진 한국어 두 문장
 *   ("좋아요 근데 비싸요")은 못 가른다 — 형태소 분석 없이 어미만으로는 오탐이 더 많다.
 */
export function isOneSentence(text: string): boolean {
  const t = text.trim()
  if (/[\r\n]/.test(t)) return false
  return !/[.!?…。！？]+(?:\s+|(?=[가-힣]))\S/.test(t) && !/[。！？][^。！？\s]/.test(t)
}

export type QuoteReason = 'ok' | 'policy_none' | 'empty' | 'multi_sentence' | 'too_long'
export interface QuoteCheck { quote: string; ok: boolean; reason: QuoteReason }

/** 고객 노출 인용 검사 한 벌. ok=false 면 quote 는 빈 문자열이다 — 그대로 화면에 꽂아도 원문이 새지 않는다. */
export function checkQuote(text: string | null | undefined, policy: QuotePolicy): QuoteCheck {
  if (policy === 'none') return { quote: '', ok: false, reason: 'policy_none' }
  const raw = String(text ?? '').trim()
  if (!raw) return { quote: '', ok: false, reason: 'empty' }
  if (!isOneSentence(raw)) return { quote: '', ok: false, reason: 'multi_sentence' }
  const flat = raw.replace(/\s+/g, ' ')
  const max = quoteLang(flat) === 'en' ? QUOTE_MAX_EN : QUOTE_MAX_KO
  if (Array.from(flat).length > max) return { quote: '', ok: false, reason: 'too_long' }
  return { quote: flat, ok: true, reason: 'ok' }
}

/** 정책을 적용한 인용 한 개. 통과 못 하면 빈 문자열(checkQuote 의 quote). */
export function policyQuote(text: string | null | undefined, policy: QuotePolicy): string {
  return checkQuote(text, policy).quote
}

/** 검사 결과 묶음 → 로그 한 줄. 0건이면 null(찍지 않는다). */
export function quoteCheckSummary(where: string, checks: readonly QuoteCheck[]): string | null {
  if (checks.length === 0) return null
  const n: Record<QuoteReason, number> = { ok: 0, policy_none: 0, empty: 0, multi_sentence: 0, too_long: 0 }
  for (const c of checks) n[c.reason]++
  return `[${where}] quote-cap checked=${checks.length} ok=${n.ok} rejected=${n.multi_sentence + n.too_long}` +
    ` (multi_sentence=${n.multi_sentence} too_long=${n.too_long}) policy_none=${n.policy_none} empty=${n.empty}`
}

/**
 * 저장된 인용 → 고객 화면에 낼 인용. 소스 키 → 정책 맵으로 거른다(맵에 없는 키는 none).
 * source_key 가 없거나(옛 인용) 정책 맵을 못 읽었으면(policies=null) 아무것도 내지 않는다(§7.1).
 * short_only 소스의 인용은 source_key 를 떼고 낸다 — 고객 화면에 소스 이름을 싣지 않는다.
 * 내부 화면(검수 등)은 이 함수를 쓰지 않는다 — 원문은 DB 에 그대로 있다.
 */
export function publicQuotes(
  quotes: EvidenceQuote[] | null | undefined,
  policies: ReadonlyMap<string, unknown> | null,
): EvidenceQuote[] {
  if (!policies || !Array.isArray(quotes)) return []
  const out: EvidenceQuote[] = []
  for (const q of quotes) {
    if (typeof q?.source_key !== 'string') continue
    const policy = quotePolicyOf(policies.get(q.source_key))
    const text = policyQuote(q.text, policy)
    if (!text) continue
    out.push(policy === 'short_only' ? { text, source_type: q.source_type } : { ...q, text })
  }
  return out
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
    source_key: typeof i?.source_key === 'string' && i.source_key ? i.source_key : null,
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
    out.push(hit.source_key ? { text, source_type: hit.source_type, source_key: hit.source_key } : { text, source_type: hit.source_type })
    if (out.length >= QUOTE_MAX_COUNT) break
  }
  return out
}
