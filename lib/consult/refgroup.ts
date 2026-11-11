// 조건부 참조집단(v71cg 부록 C) — 순수 함수(import 없음). CEM 으로 거르고 가중 k-NN, 구간은 Wilson 95%.
// 통계 수치를 화면에 내도 되는지는 gateOpen 이 정한다: 합성 복구 시험·κ≥0.61·시간분할 Brier·n 임계값이 전부 통과해야 열린다.
// 통과 전에는 화면에 "비슷한 3곳 목록(v0)"만 낸다(lib/consult/cases.ts).

export type Case = {
  structure: Record<string, string> // 구조 특성(예: 과금 방식·고객 유형·규모 구간) — 정확히 같아야 같은 층
  surface: string[] // 표면 특성(태그·키워드) — 겹침 비율
  outcome: 0 | 1 // 1 = 성공(정의는 호출자)
  year: number
}

/** Wilson 95% 구간. n=0 이면 null(구간을 만들지 않는다). */
export function wilson(k: number, n: number, z = 1.96): { lo: number; hi: number; p: number } | null {
  if (n <= 0) return null
  const p = k / n, d = 1 + (z * z) / n
  const c = (p + (z * z) / (2 * n)) / d
  const h = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d
  return { lo: Math.max(0, c - h), hi: Math.min(1, c + h), p }
}

/** n 등급: <10 숨김, 10–29 참고, ≥30 기저율. */
export const nTier = (n: number): 'hidden' | 'ref' | 'base' => (n < 10 ? 'hidden' : n < 30 ? 'ref' : 'base')

const overlap = (a: string[], b: string[]) => {
  if (!a.length || !b.length) return 0
  const B = new Set(b)
  return a.filter((x) => B.has(x)).length / new Set([...a, ...b]).size
}
/** 유사도 = 구조 일치율 0.7 + 표면 겹침 0.3. */
export function similarity(q: Pick<Case, 'structure' | 'surface'>, c: Pick<Case, 'structure' | 'surface'>): number {
  const keys = Object.keys(q.structure)
  const s = keys.length ? keys.filter((k) => c.structure[k] === q.structure[k]).length / keys.length : 0
  return 0.7 * s + 0.3 * overlap(q.surface, c.surface)
}

/** CEM: 구조 특성이 모두 같은 사례만 남긴다. 그 뒤 유사도 가중 k-NN 으로 성공률 추정. */
export function estimate(q: Pick<Case, 'structure' | 'surface'>, pool: Case[], k = 30): { p: number; n: number; neff: number; tier: ReturnType<typeof nTier>; ci: ReturnType<typeof wilson> } {
  const keys = Object.keys(q.structure)
  const matched = pool.filter((c) => keys.every((x) => c.structure[x] === q.structure[x]))
  const top = matched.map((c) => ({ c, w: similarity(q, c) })).sort((a, b) => b.w - a.w).slice(0, k)
  const ws = top.reduce((a, t) => a + t.w, 0)
  const p = ws > 0 ? top.reduce((a, t) => a + t.w * t.c.outcome, 0) / ws : NaN
  const n = top.length
  const neff = ws > 0 ? (ws * ws) / top.reduce((a, t) => a + t.w * t.w, 0) : 0
  return { p, n, neff, tier: nTier(n), ci: wilson(Math.round(p * n), n) }
}

/** Cohen κ(두 판정자 이진 라벨). */
export function kappa(a: number[], b: number[]): number {
  const n = a.length
  if (!n || b.length !== n) return NaN
  let agree = 0, a1 = 0, b1 = 0
  for (let i = 0; i < n; i++) { if (a[i] === b[i]) agree++; a1 += a[i]; b1 += b[i] }
  const po = agree / n, pe = (a1 / n) * (b1 / n) + (1 - a1 / n) * (1 - b1 / n)
  return pe === 1 ? 1 : (po - pe) / (1 - pe)
}

export const brier = (p: number[], y: number[]) => p.reduce((s, v, i) => s + (v - y[i]) ** 2, 0) / p.length

/** 시간분할 백테스트: cut 이전 사례로 이후 사례를 예측. 기준선 = 이전 전체 성공률. 반환 Brier 와 기준선 Brier. */
export function timeSplit(cases: Case[], cut: number, k = 30) {
  const train = cases.filter((c) => c.year < cut), test = cases.filter((c) => c.year >= cut)
  const base = train.length ? train.reduce((a, c) => a + c.outcome, 0) / train.length : 0.5
  const ps: number[] = [], ys: number[] = []
  for (const t of test) { const e = estimate(t, train, k); ps.push(Number.isFinite(e.p) ? e.p : base); ys.push(t.outcome) }
  return { n: test.length, brier: ps.length ? brier(ps, ys) : NaN, baseline: ys.length ? brier(ys.map(() => base), ys) : NaN }
}

export type Gate = { recovery: boolean; kappa: boolean; brier: boolean; sensitivity: boolean; nMin: boolean }
/** 게이트: 전부 true 일 때만 통계 수치를 화면에 낸다. */
export const gateOpen = (g: Gate) => g.recovery && g.kappa && g.brier && g.sensitivity && g.nMin
