// 1층(해금) 검증기 — 순수 함수(import 없음). ⓐ 재계산 손실 ⓑ 후보 2개+반박 각 1개 ⓒ 벤치마크 ⓓ 메모 첫 문장.
// ⓐ 의 곱셈은 모델이 아니라 여기서 한다: 모델은 항(label, low, high)만 내고 low_man = ∏low, high_man = ∏high 를 코드가 계산한다.
// 사용자가 입력한 숫자는 항의 low = high 로 고정돼야 한다(모델이 바꾸면 거절) — "내 숫자 재계산"의 약속.

export type UserNumbers = { audience: number; rate_pct: number; value_man: number } // 월 대상자 수 · 현재 전환율(%) · 객단가(만원)

export type Ch1L1 = {
  inputs: UserNumbers
  recalc: { terms: { label: string; low: number; high: number; user: boolean }[]; low_man: number; high_man: number; note: string }
  candidates: { title: string; what: string; why: string; rebuttal: string }[]
  benchmark: { position: string; basis: string; similar: { name: string; what: string }[] }
  memo_first: string
}

const BANNED = /90\s*일\s*재측정/

export function parseUserNumbers(raw: Record<string, unknown>): UserNumbers {
  const n = (v: unknown, field: string, min: number, max: number) => {
    const x = Number(String(v ?? '').replace(/,/g, '').trim())
    if (!Number.isFinite(x) || x < min || x > max) throw new Error(`숫자 입력 오류: ${field}`)
    return x
  }
  return {
    audience: n(raw.audience, '월 대상자 수', 1, 1e9),
    rate_pct: n(raw.rate_pct, '현재 전환율(%)', 0, 100),
    value_man: n(raw.value_man, '객단가(만원)', 0, 1e6),
  }
}

const s = (v: unknown, max: number, field: string) => {
  if (typeof v !== 'string' || !v.trim()) throw new Error(`1층 형식 오류: ${field} 없음`)
  return v.trim().slice(0, max)
}

export function validateL1(raw: Record<string, unknown>, inputs: UserNumbers): Ch1L1 {
  const rc = (raw.recalc ?? {}) as Record<string, unknown>
  const termsRaw = Array.isArray(rc.terms) ? rc.terms : []
  if (termsRaw.length < 2 || termsRaw.length > 6) throw new Error('1층 형식 오류: 산식 항은 2~6개')
  const terms = termsRaw.map((t, i) => {
    const o = (t ?? {}) as Record<string, unknown>
    const low = Number(o.low)
    const high = Number(o.high)
    if (!Number.isFinite(low) || !Number.isFinite(high) || low < 0 || high < low) throw new Error(`1층 형식 오류: 항 ${i + 1} 숫자`)
    return { label: s(o.label, 60, `항 ${i + 1} 이름`), low, high, user: o.user === true }
  })
  // 사용자 숫자 3개는 low=high 로 그대로 들어 있어야 한다.
  const has = (v: number) => terms.some((t) => t.user && t.low === v && t.high === v)
  if (!has(inputs.audience) || !has(inputs.value_man)) throw new Error('1층 형식 오류: 사용자 숫자가 산식에 그대로 들어 있지 않음')
  const rate = inputs.rate_pct / 100
  if (!has(inputs.rate_pct) && !has(rate)) throw new Error('1층 형식 오류: 사용자 전환율이 산식에 그대로 들어 있지 않음')
  const low = Math.round(terms.reduce((a, t) => a * t.low, 1))
  const high = Math.round(terms.reduce((a, t) => a * t.high, 1))
  if (high <= 0) throw new Error('1층 형식 오류: 재계산 손실이 0')

  const cands = Array.isArray(raw.candidates) ? raw.candidates : []
  if (cands.length !== 2) throw new Error('1층 형식 오류: 후보는 정확히 2개')
  const candidates = cands.map((c, i) => {
    const o = (c ?? {}) as Record<string, unknown>
    return { title: s(o.title, 80, `후보 ${i + 1} 제목`), what: s(o.what, 400, `후보 ${i + 1} 내용`), why: s(o.why, 400, `후보 ${i + 1} 근거`), rebuttal: s(o.rebuttal, 400, `후보 ${i + 1} 반박`) }
  })
  const bm = (raw.benchmark ?? {}) as Record<string, unknown>
  const out: Ch1L1 = {
    inputs,
    recalc: { terms, low_man: low, high_man: high, note: typeof rc.note === 'string' ? rc.note.slice(0, 200) : '' },
    candidates,
    benchmark: { position: s(bm.position, 300, 'benchmark.position'), basis: s(bm.basis, 300, 'benchmark.basis'), similar: [] },
    memo_first: s(raw.memo_first, 200, 'memo_first'),
  }
  if (BANNED.test(JSON.stringify(out))) throw new Error('1층 문체 오류: 금지 표현')
  return out
}

/** 0층 1차 추정과 1층 2차 계산이 갈리는 이유를 코드로 설명한다(LLM 아님, 2026-11-13 지시 §2-2 설계안). 구조적으로 항상 같은 이유라 항상 보여준다. */
export function explainLossDivergence(l0: { low_man: number; high_man: number }, l1: { low_man: number; high_man: number }): string {
  const dir = l1.low_man >= l0.high_man ? '높게' : l1.high_man <= l0.low_man ? '낮게' : null
  const base = `1차 추정(월 ${l0.low_man.toLocaleString('ko-KR')}~${l0.high_man.toLocaleString('ko-KR')}만원)과 2차 계산(월 ${l1.low_man.toLocaleString('ko-KR')}~${l1.high_man.toLocaleString('ko-KR')}만원)`
  if (!dir) return `${base}은 겹치는 범위가 있습니다. 1차는 업종 평균 규모로 가정했고, 2차는 대표님이 입력하신 숫자를 그대로 썼습니다.`
  return `${base}이 다른 이유: 1차는 업종 평균 규모로 가정했고, 2차는 대표님이 입력하신 숫자를 그대로 썼기 때문입니다. 2차가 1차보다 ${dir} 나왔습니다.`
}
