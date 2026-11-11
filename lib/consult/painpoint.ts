// 페인포인트 v2(v71cg 부록 C) — 순수 함수(import 없음). LLM 은 추출·군집 이름짓기만 하고, 가중·보정·게이트는 전부 코드가 계산한다.
// 순서: 구조화 추출(Mention) → ODI식 결과 군집(cluster) → 심각도 가중 → 우회행동 우선순위 → Kano → J-curve 보정 → 3출처 교차 게이트 → 비자명성 게이트.

export type Kano = 'must_be' | 'one_dim' | 'attractive' | 'indifferent'
export type Mention = {
  id: string
  source: string // 출처(appstore·googleplay·reddit …) — 3출처 교차 게이트의 단위
  rating: number | null // 1~5 (없으면 null)
  outcome: string // ODI 결과문: "~을 하는 시간을 줄인다/실수를 줄인다" 형태로 추출된 것
  severity: number // 1~5, 모델이 원문에서 읽은 심각도
  workaround: string | null // 고객이 만든 우회행동(엑셀로 따로 기록 등), 없으면 null
  kano: Kano
  obvious: boolean // 이 카테고리 누구나 아는 불만(느리다·버그)인가
  cluster: string // 군집 이름(군집 단계에서 부여)
}

/** J-curve 보정: 리뷰는 1점·5점에 몰린다. 별점 분포 비중이 균등(20%)보다 큰 구간은 낮추고 작은 구간은 올린다. 가중 0.5~2 로 제한. */
export function jCurveWeights(ratings: (number | null)[]): Record<number, number> {
  const rs = ratings.filter((r): r is number => r != null && r >= 1 && r <= 5)
  const w: Record<number, number> = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 }
  if (rs.length < 20) return w // 표본이 작으면 보정하지 않는다(과교정 방지)
  for (let r = 1; r <= 5; r++) {
    const share = rs.filter((x) => x === r).length / rs.length
    w[r] = share > 0 ? Math.min(2, Math.max(0.5, 0.2 / share)) : 1
  }
  return w
}

export type Cluster = {
  name: string
  n: number // 언급 수(원시)
  weighted: number // J-curve 보정 후 가중 언급 수
  severity: number // 평균 심각도
  score: number // 우선순위 점수 = 가중 언급 × 평균 심각도 × (1 + 0.5×우회행동 비율)
  workaroundShare: number
  workarounds: string[]
  kano: Kano
  sources: string[]
  obvious: boolean
}

const mode = <T extends string>(xs: T[]): T => {
  const c = new Map<T, number>()
  xs.forEach((x) => c.set(x, (c.get(x) ?? 0) + 1))
  return [...c.entries()].sort((a, b) => b[1] - a[1])[0][0]
}

export function score(ms: Mention[]): Cluster[] {
  const w = jCurveWeights(ms.map((m) => m.rating))
  const by = new Map<string, Mention[]>()
  for (const m of ms) by.set(m.cluster, [...(by.get(m.cluster) ?? []), m])
  return [...by.entries()].map(([name, g]) => {
    const weighted = g.reduce((a, m) => a + (m.rating ? w[m.rating] : 1), 0)
    const severity = g.reduce((a, m) => a + m.severity, 0) / g.length
    const wk = g.filter((m) => m.workaround)
    const workaroundShare = wk.length / g.length
    return {
      name, n: g.length, weighted: Math.round(weighted * 10) / 10, severity: Math.round(severity * 10) / 10,
      score: Math.round(weighted * severity * (1 + 0.5 * workaroundShare) * 10) / 10,
      workaroundShare: Math.round(workaroundShare * 100) / 100, workarounds: [...new Set(wk.map((m) => m.workaround as string))].slice(0, 3),
      kano: mode(g.map((m) => m.kano)), sources: [...new Set(g.map((m) => m.source))],
      obvious: g.filter((m) => m.obvious).length > g.length / 2,
    }
  }).sort((a, b) => b.score - a.score)
}

export type Gated = { passed: Cluster[]; rejected: { cluster: Cluster; reason: 'sources' | 'obvious' | 'thin' }[] }

/** 게이트: ① 3출처 교차(서로 다른 출처 ≥ minSources) ② 비자명성(누구나 아는 불만 제외) ③ 얇음(언급 < minN). 하나라도 어기면 화면에 내지 않는다. */
export function gate(cs: Cluster[], opt: { minSources?: number; minN?: number } = {}): Gated {
  const minSources = opt.minSources ?? 3, minN = opt.minN ?? 5
  const passed: Cluster[] = [], rejected: Gated['rejected'] = []
  for (const c of cs) {
    if (c.n < minN) rejected.push({ cluster: c, reason: 'thin' })
    else if (c.sources.length < minSources) rejected.push({ cluster: c, reason: 'sources' })
    else if (c.obvious) rejected.push({ cluster: c, reason: 'obvious' })
    else passed.push(c)
  }
  return { passed, rejected }
}
