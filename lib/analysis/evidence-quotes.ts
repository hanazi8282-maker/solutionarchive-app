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
//   - 단, 이건 **저장** 검사다. **고객 화면**에 인용(따옴표)으로 내기 전에는 checkQuote 가 전문 대조를 다시 건다(v22 #3).
//
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다. `@/` 별칭·enum 을 쓰지 않는다.

/** **저장** 상한(내부 정본 evidence_quotes). 고객 화면 상한이 아니다 — 그건 checkQuote·checkSummary(QUOTE_MAX_KO·EN). */
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
 *  - none       : 인용 불가(빈 값).
 * 글자 상한은 full·short_only 공통이다(v22 #3 — 한국어 130·영어 240, 문장 수 무관). 옛 full 300자·short_only 140자는 없앴다.
 * 내부 DB 는 정책과 무관하게 출처·원문 주소를 보존한다(analysis_inputs.source_key·source_url·raw_text).
 */
export type QuotePolicy = 'full' | 'short_only' | 'none'

/** DB 값 → 정책. 모르는 값·NULL·못 읽음은 'none'(§7.1 — 확인 불가를 허용으로 접지 않는다). */
export function quotePolicyOf(v: unknown): QuotePolicy {
  return v === 'full' || v === 'short_only' ? v : 'none'
}

/**
 * 고객 화면 인용·요약 글자 상한(남헌 v22 #3, 2026-10-05 밤 — v20 #5 '한 문장 ∧ 100/200자'를 대체).
 * 기준은 **글자 수뿐**이다. 문장 수는 보지 않는다(두 문장이어도 상한 안이면 통과).
 *  - 목표 약 100자(QUOTE_TARGET_CHARS) — 권고. 발췌·요약하는 쪽(프롬프트·사람)이 겨냥할 값이고 검사하지 않는다.
 *  - 하드 상한 한국어 130자·영어 240자 — 넘으면 거부(빈 값). 자르지 않는다(잘린 문장은 원문이 아니다).
 * full·short_only 공통, 인용·요약 공통. 글자 수는 코드포인트(Array.from) 기준, 공백은 한 칸으로 눕힌 뒤 센다.
 * (v20 의 '한 문장' 검사는 없앴다 — 약어 "e.g."·말줄임 "음..."을 두 문장으로 오거부하던 한계도 같이 사라졌다.)
 */
export const QUOTE_TARGET_CHARS = 100
export const QUOTE_MAX_KO = 130
export const QUOTE_MAX_EN = 240

/**
 * 언어 판정 — 글자(한글 음절·자모 + 라틴 문자) 중 한글 비중. 결정적이고 사전·모델이 없다.
 *  - 한글 ≥ 10% → 'ko'. 한국어 리뷰는 영어 제품명이 섞여도("AirPods 배터리가 금방 닳아요") 한글 비중이 훨씬 높다.
 *    10% 미만은 영어 문장에 한글 낱말 하나가 낀 정도라 'en'.
 *  - 글자가 하나도 없음(숫자·이모지·한자·가나뿐) → 'unknown' → 더 엄격한 130자를 쓴다.
 */
export function quoteLang(text: string): 'ko' | 'en' | 'unknown' {
  const ko = (text.match(/[ᄀ-ᇿ㄰-㆏가-힣]/g) ?? []).length
  const en = (text.match(/[A-Za-z]/g) ?? []).length
  if (ko + en === 0) return 'unknown'
  return ko / (ko + en) >= 0.1 ? 'ko' : 'en'
}

/**
 * 발췌가 원문 그대로인가. 공백 차이(줄바꿈·여러 칸)만 눈감고 글자는 그대로 비교한다(대소문자 포함).
 *  - '…' 이 없으면: 발췌 전체가 원문의 연속 부분문자열이어야 한다.
 *  - '…' 이 있으면(생략 표시): '…' 로 나눈 조각이 **순서대로** 원문에 나타나야 한다(조각 사이 = 건너뛴 부분).
 *    앞뒤 '…'(빈 조각)은 무시한다. 조각이 하나도 없으면 거짓.
 *  - '...'(마침표 셋)은 생략 표시로 보지 않는다 — 원문의 말줄임일 수 있어 글자 그대로 대조한다.
 * ponytail: 조각 길이 하한이 없다 — "좋…요" 처럼 한두 글자 조각은 거의 아무 원문에서나 순서대로 찾아진다.
 *   지금 발췌는 의미 단위로 잘라 오므로 두고, 짜깁기가 실제로 보이면 조각당 최소 글자 수를 건다.
 */
export function isVerbatimExcerpt(excerpt: string, source: string): boolean {
  const src = squash(source)
  const parts = squash(excerpt).split('…').map((p) => p.trim()).filter(Boolean)
  if (parts.length === 0 || !src) return false
  let from = 0
  for (const p of parts) {
    const at = src.indexOf(p, from)
    if (at < 0) return false
    from = at + p.length
  }
  return true
}

/**
 * 화면에 내는 글의 두 종류 — **kind 를 항상 같이 들고 다닌다.**
 *  - 'quote'  : 원문에서 그대로 발췌. checkQuote 가 isVerbatimExcerpt 를 통과시킨 것만 이 kind 로 ok 가 된다.
 *               렌더 규약: 호출부가 따옴표로 감싸 표시한다(이 모듈은 따옴표를 붙이지 않는다).
 *  - 'summary': 원문을 줄여 쓴 문장. 렌더 규약: 따옴표를 쓰지 않고 '요약' 표시를 붙인다 — 인용처럼 보이게 하지 않는다.
 * summary 는 quote 로 승격할 수 없다: kind 가 리터럴 타입이라 SummaryCheck 를 QuoteCheck 자리에 못 넣고,
 * checkQuote 는 문자열만 받으며(객체가 오면 거부) 원문 대조를 통과해야만 ok 를 낸다 — 줄여 쓴 문장은 원문에 없으니 떨어진다.
 */
export type QuoteKind = 'quote' | 'summary'
export type QuoteReason = 'ok' | 'policy_none' | 'empty' | 'too_long' | 'not_verbatim'
export type SummaryReason = Exclude<QuoteReason, 'not_verbatim'>
/** ok=false 면 text 는 빈 문자열이다 — 그대로 화면에 꽂아도 원문이 새지 않는다. */
export interface QuoteCheck { kind: 'quote'; text: string; ok: boolean; reason: QuoteReason }
export interface SummaryCheck { kind: 'summary'; text: string; ok: boolean; reason: SummaryReason }

/** 정책·빈 값·글자 상한 — 인용·요약 공통. 통과면 공백 눕힌 글, 아니면 거부 사유. */
function capCheck(text: unknown, policy: QuotePolicy): { flat: string } | { reason: SummaryReason } {
  if (policy === 'none') return { reason: 'policy_none' }
  const flat = typeof text === 'string' ? squash(text) : ''
  if (!flat) return { reason: 'empty' }
  const max = quoteLang(flat) === 'en' ? QUOTE_MAX_EN : QUOTE_MAX_KO
  if (Array.from(flat).length > max) return { reason: 'too_long' }
  return { flat }
}

type Sources = string | readonly (string | null | undefined)[] | null | undefined

/**
 * 고객 노출 인용 검사. source = 그 발췌를 뽑아 온 원문(여러 개면 그중 하나에 그대로 있으면 된다).
 * 원문을 못 받으면(null·빈 배열) 대조할 수 없으므로 거부한다(§7.1 — 확인 불가를 허용으로 접지 않는다).
 * 문자열이 아닌 값(SummaryCheck 객체 등)은 인용이 아니다 — 거부(not_verbatim).
 */
export function checkQuote(text: string | null | undefined, policy: QuotePolicy, source: Sources): QuoteCheck {
  if (text != null && typeof text !== 'string') return { kind: 'quote', text: '', ok: false, reason: 'not_verbatim' }
  const c = capCheck(text, policy)
  if ('reason' in c) return { kind: 'quote', text: '', ok: false, reason: c.reason }
  const srcs = (typeof source === 'string' ? [source] : source ?? []).filter((s): s is string => typeof s === 'string')
  if (!srcs.some((s) => isVerbatimExcerpt(c.flat, s))) return { kind: 'quote', text: '', ok: false, reason: 'not_verbatim' }
  return { kind: 'quote', text: c.flat, ok: true, reason: 'ok' }
}

/** 고객 노출 요약 검사 — 원문 대조 없음(줄여 쓴 글이라 원문에 없다). 정책·글자 상한은 인용과 같다. */
export function checkSummary(text: string | null | undefined, policy: QuotePolicy): SummaryCheck {
  const c = capCheck(text, policy)
  if ('reason' in c) return { kind: 'summary', text: '', ok: false, reason: c.reason }
  return { kind: 'summary', text: c.flat, ok: true, reason: 'ok' }
}

/** 정책을 적용한 인용 한 개. 통과 못 하면 빈 문자열(checkQuote 의 text). */
export function policyQuote(text: string | null | undefined, policy: QuotePolicy, source: Sources): string {
  return checkQuote(text, policy, source).text
}

/** 검사 결과 묶음 → 로그 한 줄. 0건이면 null(찍지 않는다). */
export function quoteCheckSummary(where: string, checks: readonly QuoteCheck[]): string | null {
  if (checks.length === 0) return null
  const n: Record<QuoteReason, number> = { ok: 0, policy_none: 0, empty: 0, too_long: 0, not_verbatim: 0 }
  for (const c of checks) n[c.reason]++
  return `[${where}] quote-cap checked=${checks.length} ok=${n.ok} rejected=${n.too_long + n.not_verbatim}` +
    ` (too_long=${n.too_long} not_verbatim=${n.not_verbatim}) policy_none=${n.policy_none} empty=${n.empty}`
}

/**
 * 저장된 인용 → 고객 화면에 낼 인용. 소스 키 → 정책 맵으로 거른다(맵에 없는 키는 none).
 * source_key 가 없거나(옛 인용) 정책 맵을 못 읽었으면(policies=null) 아무것도 내지 않는다(§7.1).
 * sources = 그 인용들을 뽑아 온 입력 원문(analysis_inputs.raw_text). 저장 검사는 앞 20자뿐이라 여기서 전문 대조를
 * 다시 건다(v22 #3) — 원문을 안 주면 0건.
 * short_only 소스의 인용은 source_key 를 떼고 낸다 — 고객 화면에 소스 이름을 싣지 않는다.
 * 내부 화면(검수 등)은 이 함수를 쓰지 않는다 — 원문은 DB 에 그대로 있다.
 */
export function publicQuotes(
  quotes: EvidenceQuote[] | null | undefined,
  policies: ReadonlyMap<string, unknown> | null,
  sources: readonly (string | null | undefined)[] | null,
): EvidenceQuote[] {
  if (!policies || !Array.isArray(quotes)) return []
  const out: EvidenceQuote[] = []
  for (const q of quotes) {
    if (typeof q?.source_key !== 'string') continue
    const policy = quotePolicyOf(policies.get(q.source_key))
    const text = policyQuote(q.text, policy, sources)
    if (!text) continue
    out.push(policy === 'short_only' ? { text, source_type: q.source_type } : { ...q, text })
  }
  return out
}

/** 공백 차이로 멀쩡한 인용이 떨어지지 않게 한다. 글자 자체는 바꾸지 않는다. */
export function squash(s: string): string {
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
