// 성공/실패 비교 — "같은 수를 썼는데 갈린 사례". **순수 함수만**(match.ts:3-4 규약).
//
// 짝의 조건: 같은 병목 + 같은 레버 · 방향이 positive ↔ negative · **서로 다른 케이스** ·
// 양쪽 다 승인(케이스·무브 둘 다). 같은 케이스 안에서 갈린 것은 비교가 아니라 그 케이스의
// 서사다 — 그걸 짝으로 세면 "남들은 갈렸다"가 자기 자신을 본 것이 된다(matchMoves 와 같은 정신).
//
// ⚠️ matchMoves 는 negative 를 아예 뺀다(선례축 오염 방지, 2026-09-21 남헌 결정).
//    그 정책은 **건드리지 않는다.** 여기는 선례를 세는 자리가 아니라 대조하는 자리라
//    negative 가 필요하고, 이 함수의 결과는 PMF 축에 들어가지 않는다.
//
// ★ §7.1 3상태: matched(짝 있음) / no_match(찾았는데 0묶음) / not_run(조회 실패).
//   2026-09-23 DB 실측으로 SaaS 끼리 짝은 0쌍이다 — 그 사실을 화면에서 **그대로** 말한다.

import type { AdvisorStatus } from './advisor.ts'
import type { MoveRow, StudyRow } from './match.ts'

export interface PairSide { move: MoveRow; study: StudyRow }

export interface MovePair {
  key: string
  bottleneck: string
  lever: string
  positive: PairSide[]
  negative: PairSide[]
  /** 양쪽 다 SaaS 인 대조가 이 묶음 안에 하나라도 있는가. */
  saas: boolean
}

export interface PairResult {
  status: AdvisorStatus
  reason: string
  pairs: MovePair[]
  /** SaaS 끼리 갈린 묶음 수. 0 이면 화면이 "축적 중"이라고 말한다. */
  saas_pairs: number
}

/** SaaS 짝이 0일 때의 문구. 가짜로 채우지 않고 지금 있는 것만 말한다. */
export function saasPairNotice(consumerPairs: number): string {
  return `SaaS 비교 사례 축적 중 — 지금은 소비재 짝 ${consumerPairs}묶음`
}

const isSaas = (s: StudyRow) => s.business_model === 'SAAS'

export function pairMoves(
  studies: StudyRow[] | null | undefined,
  moves: MoveRow[] | null | undefined,
): PairResult {
  if (studies == null || moves == null) {
    return { status: 'not_run', reason: '케이스·무브 조회가 실패했다 (null) — "갈린 사례 0묶음"이 아니라 확인 불가다', pairs: [], saas_pairs: 0 }
  }

  const byId = new Map(studies.map((s) => [s.id, s]))
  const groups = new Map<string, { bottleneck: string; lever: string; positive: PairSide[]; negative: PairSide[] }>()

  for (const m of moves) {
    const study = byId.get(m.case_study_id)
    if (!study) continue
    if (study.review_status !== 'approved' || m.review_status !== 'approved') continue
    if (m.outcome_direction !== 'positive' && m.outcome_direction !== 'negative') continue
    const key = `${study.bottleneck}|${m.lever}`
    const g = groups.get(key) ?? { bottleneck: study.bottleneck, lever: m.lever, positive: [], negative: [] }
    g[m.outcome_direction === 'positive' ? 'positive' : 'negative'].push({ move: m, study })
    groups.set(key, g)
  }

  const pairs: MovePair[] = []
  for (const [key, g] of groups) {
    // 케이스가 같으면 대조가 아니다. 교차 케이스 대조가 하나라도 있어야 묶음이 성립한다.
    const cross = g.positive.some((p) => g.negative.some((n) => n.study.id !== p.study.id))
    if (!cross) continue
    const saas = g.positive.some((p) => isSaas(p.study) && g.negative.some((n) => n.study.id !== p.study.id && isSaas(n.study)))
    pairs.push({ key, bottleneck: g.bottleneck, lever: g.lever, positive: g.positive, negative: g.negative, saas })
  }
  pairs.sort((a, b) => Number(b.saas) - Number(a.saas) || a.key.localeCompare(b.key))

  const saas_pairs = pairs.filter((p) => p.saas).length
  if (pairs.length === 0) {
    return { status: 'no_match', reason: '조회는 정상인데 같은 병목·레버로 갈린 승인 짝이 0묶음이다 — 확인해보니 없다', pairs: [], saas_pairs: 0 }
  }
  return {
    status: 'matched',
    reason: `갈린 짝 ${pairs.length}묶음 (SaaS 끼리 ${saas_pairs}묶음)`,
    pairs,
    saas_pairs,
  }
}
