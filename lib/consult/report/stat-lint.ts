// G6(2026-11-13): 근거 없는 확률·통계성 숫자가 메모·에이전트 답변에 섞이지 않게 막는다. 순수 함수(import 없음).
// 사용자가 입력한 숫자(전환율·객단가 등 UserNumbers)나 민감도 표(10/20/30%) 인용은 막지 않는다 —
// 그런 숫자는 "유지"·"이상"·"이하"처럼 쓰이고, 아래 금지 패턴은 모델이 스스로 지어내는 확률 서술만 겨눈다.

/** "예측 확률"류 — prediction_pct 필드가 없어진 뒤로는 이 단어가 본문에 나오면 모델이 숫자를 서술로 되살린 것이다. */
const PROBABILITY_WORD = /예측\s*확률|성공\s*확률|확률(?:이|은|로)?\s*\d+\s*%/

/** "~% 더 늘어날 여지" 류 — 근거 없이 지어낸 변화율. 사용자 입력값 유지(예: "전환율 3.2% 이상 유지")는 여기 걸리지 않는다. */
const INVENTED_DELTA = /\d+(?:\.\d+)?\s*%\s*(?:더|씩)?\s*(?:늘어날|줄어들|증가할|감소할|오를|떨어질)/

export function findStatViolations(text: string): string[] {
  const hits: string[] = []
  if (PROBABILITY_WORD.test(text)) hits.push('확률 서술')
  if (INVENTED_DELTA.test(text)) hits.push('근거 없는 변화율(예: "~% 더 늘어날 여지")')
  return hits
}

/** 위반이 있으면 던진다(§7.1: 확인 실패를 양성으로 접지 않는다 — 걸리면 거절하고 모델에게 다시 쓰게 한다). */
export function assertNoStatViolations(text: string, where: string): void {
  const hits = findStatViolations(text)
  if (hits.length) throw new Error(`통계성 문장 금지(${where}): ${hits.join(', ')}`)
}
