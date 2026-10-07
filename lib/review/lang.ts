// 리뷰 본문 언어 판정 — 한글 비율 휴리스틱(2026-10-08, 남헌 v43 §2-a).
//
// ⚠️ 휴리스틱이다. 언어 식별기가 아니라 "한국어인가 아닌가"만 가린다. 스페인어·독일어 같은 다른 라틴 문자 언어는
//    서로 구분하지 못한다 — 그래서 'es' 로 단정하지 않고 'und-latn'(한국어가 아님은 읽었으나 어떤 언어인지는 모른다)으로 둔다.
//    §7.1: 못 읽은 'und' 와 "읽었는데 모른다" 'und-latn' 은 다른 상태다.
//
// 글자(\p{L})만 센다 — 숫자·공백·구두점·이모지·기호는 분모에서 뺀다.
//   한글 = \p{Script=Hangul}(음절 가-힣, 자모 ㄱ-ㅎ·ㅏ-ㅣ 포함), 라틴 = \p{Script=Latin}(확장 라틴 포함), 나머지 = 기타.
//
// 판정(위에서부터):
//   글자 0                          → 'und'
//   한글/전체 ≥ KO_RATIO            → 'ko'   (영어 단어 섞인 한국어 리뷰 포함. 한 글자 '굿' 도 비율 1.0 이라 ko)
//   글자 < MIN_LETTERS              → 'und'  (한글이 아닌 1~2글자 'ok' 는 근거가 모자라다)
//   라틴 > 기타                     → hl 이 en 계열이면 'en', 아니면 'und-latn'
//   그 외(한자·키릴·아랍·태국 등 우세) → 'und'
export const KO_RATIO = 0.3 // 근거: 실측이 아니라 경험 임계 — 영어 단어가 섞인 한국어 리뷰("앱 UI 좋아요 good")를 ko 로 살리고, 한글 인사 한마디가 붙은 긴 영문 리뷰는 놓는 선.
export const MIN_LETTERS = 3 // 근거: 한글 외 문자는 2글자 이하면 어느 문자 체계인지조차 말하기 어렵다(경험값).

const count = (s: string, re: RegExp) => (s.match(re) ?? []).length

export function detectReviewLang(text: string, hl?: string | null): 'ko' | 'en' | 'und-latn' | 'und' {
  const total = count(text, /\p{L}/gu)
  if (total === 0) return 'und'
  const hangul = count(text, /\p{Script=Hangul}/gu)
  if (hangul >= total * KO_RATIO) return 'ko' // 곱셈 비교 — 0.3 경계에서 부동소수 나눗셈을 피한다
  if (total < MIN_LETTERS) return 'und'
  const latin = count(text, /\p{Script=Latin}/gu)
  if (latin > total - hangul - latin) return (hl ?? '').toLowerCase().split('-')[0] === 'en' ? 'en' : 'und-latn'
  return 'und'
}
