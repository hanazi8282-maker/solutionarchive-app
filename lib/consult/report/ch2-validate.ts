// 결론서 2장 "결정 메모" 검증기 — 순수 함수(import 없음). 유료 기능이자 결론서 v4 2장.
// 문체(v71ci §2): 합니다체, 권고는 "~하세요", 별명 금지, "90일 재측정" 금지, 액션플랜은 쓰되 날짜를 넣지 않는다(done_when 은 완료 조건이지 날짜가 아니다).

export type Ch2 = {
  decision: string // 첫 문장 = 1층 ⓓ memo_first 와 같은 결론
  options: { name: string; pros: string; cons: string }[]
  recommendation: { choice: string; reasons: string[]; change_mind_if: string[] }
  risks: { risk: string; mitigation: string }[]
  actionplan: { step: string; done_when: string }[]
}

const BANNED = /90\s*일\s*재측정/
// 액션플랜 단계에 날짜(2026-11-30, 11월 30일, 3월 말, 다음 주 등 구체 일정)를 넣지 않는다.
const DATED = /(\d{4}[-./]\d{1,2}[-./]\d{1,2}|\d{1,2}\s*월\s*\d{1,2}\s*일|\d{1,2}\s*[/]\s*\d{1,2}(?!\d)|다음\s*주|이번\s*주|내일|오늘까지)/

const s = (v: unknown, max: number, field: string) => {
  if (typeof v !== 'string' || !v.trim()) throw new Error(`메모 형식 오류: ${field} 없음`)
  return v.trim().slice(0, max)
}
const arr = (v: unknown, min: number, max: number, field: string): unknown[] => {
  if (!Array.isArray(v) || v.length < min || v.length > max) throw new Error(`메모 형식 오류: ${field} 는 ${min}~${max}개`)
  return v
}

export function validateCh2(raw: Record<string, unknown>, memoFirst: string): Ch2 {
  const rec = (raw.recommendation ?? {}) as Record<string, unknown>
  const out: Ch2 = {
    decision: s(raw.decision, 200, 'decision'),
    options: arr(raw.options, 2, 4, '선택지').map((o, i) => {
      const x = (o ?? {}) as Record<string, unknown>
      return { name: s(x.name, 80, `선택지 ${i + 1} 이름`), pros: s(x.pros, 300, `선택지 ${i + 1} 장점`), cons: s(x.cons, 300, `선택지 ${i + 1} 단점`) }
    }),
    recommendation: {
      choice: s(rec.choice, 120, 'recommendation.choice'),
      reasons: arr(rec.reasons, 2, 4, '권고 이유').map((r, i) => s(r, 300, `권고 이유 ${i + 1}`)),
      change_mind_if: arr(rec.change_mind_if, 1, 3, '결정을 바꿀 조건').map((r, i) => s(r, 300, `바꿀 조건 ${i + 1}`)),
    },
    risks: arr(raw.risks, 1, 4, '위험').map((o, i) => {
      const x = (o ?? {}) as Record<string, unknown>
      return { risk: s(x.risk, 300, `위험 ${i + 1}`), mitigation: s(x.mitigation, 300, `완화 ${i + 1}`) }
    }),
    actionplan: arr(raw.actionplan, 3, 6, '액션플랜').map((o, i) => {
      const x = (o ?? {}) as Record<string, unknown>
      return { step: s(x.step, 200, `단계 ${i + 1}`), done_when: s(x.done_when, 200, `단계 ${i + 1} 완료 조건`) }
    }),
  }
  const text = JSON.stringify(out)
  if (BANNED.test(text)) throw new Error('메모 문체 오류: 금지 표현')
  if (out.actionplan.some((a) => DATED.test(a.step) || DATED.test(a.done_when))) throw new Error('메모 형식 오류: 액션플랜에 날짜가 들어 있음')
  // 메모의 첫 문장은 1층 ⓓ 와 같은 결론이어야 한다(화면 사이 모순 방지) — 앞 20자가 같거나 포함 관계.
  const a = out.decision.replace(/\s/g, '')
  const b = memoFirst.replace(/\s/g, '')
  if (b && !(a.startsWith(b.slice(0, 20)) || b.startsWith(a.slice(0, 20)))) throw new Error('메모 형식 오류: 결정 문장이 1층 메모 첫 문장과 다름')
  return out
}
