// 결론서 3~6장 검증기 — 순수 함수(import 없음). 3 발전 방향 후보 · 4 고객의 고객 · 5 경쟁 지도 · 6 걸림돌.
// 모든 항목에 근거(basis/evidence)가 있어야 한다. 근거를 못 대는 항목은 버리지 않고 거절한다(빈 칸으로 접지 않는다 — §7.1).
// 문체(v71ci §2): 합니다체, 권고는 "~하세요", 별명 금지, "90일 재측정" 금지, 액션플랜은 날짜 없이.

export type Ch3to6 = {
  candidates: { title: string; what: string; why: string; rebuttal: string }[]
  customers: { who: string; need: string; reach: string }[]
  competitors: { name: string; kind: string; basis: string }[]
  obstacles: { obstacle: string; evidence: string; handle: string }[]
}

const BANNED = /90\s*일\s*재측정/

const s = (v: unknown, max: number, field: string) => {
  if (typeof v !== 'string' || !v.trim()) throw new Error(`3~6장 형식 오류: ${field} 없음`)
  return v.trim().slice(0, max)
}
const list = (v: unknown, min: number, max: number, field: string): Record<string, unknown>[] => {
  if (!Array.isArray(v) || v.length < min || v.length > max) throw new Error(`3~6장 형식 오류: ${field} 는 ${min}~${max}개`)
  return v.map((x) => (x ?? {}) as Record<string, unknown>)
}

export function validateCh3to6(raw: Record<string, unknown>): Ch3to6 {
  const out: Ch3to6 = {
    candidates: list(raw.candidates, 2, 3, '발전 방향 후보').map((o, i) => ({ title: s(o.title, 80, `후보 ${i + 1} 제목`), what: s(o.what, 400, `후보 ${i + 1} 내용`), why: s(o.why, 400, `후보 ${i + 1} 근거`), rebuttal: s(o.rebuttal, 400, `후보 ${i + 1} 반박`) })),
    customers: list(raw.customers, 2, 4, '고객의 고객').map((o, i) => ({ who: s(o.who, 120, `고객 ${i + 1} 누구`), need: s(o.need, 300, `고객 ${i + 1} 필요`), reach: s(o.reach, 300, `고객 ${i + 1} 닿는 방법`) })),
    competitors: list(raw.competitors, 2, 6, '경쟁 지도').map((o, i) => ({ name: s(o.name, 80, `경쟁 ${i + 1} 이름`), kind: s(o.kind, 80, `경쟁 ${i + 1} 유형`), basis: s(o.basis, 300, `경쟁 ${i + 1} 근거`) })),
    obstacles: list(raw.obstacles, 2, 5, '걸림돌').map((o, i) => ({ obstacle: s(o.obstacle, 200, `걸림돌 ${i + 1}`), evidence: s(o.evidence, 300, `걸림돌 ${i + 1} 근거`), handle: s(o.handle, 300, `걸림돌 ${i + 1} 대응`) })),
  }
  if (BANNED.test(JSON.stringify(out))) throw new Error('3~6장 문체 오류: 금지 표현')
  return out
}
