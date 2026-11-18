// [v71ct §4 · v71ct-1 §4] 병목 장 → 흐름 카드 꺼내 쓰기. 순수 함수 + 얇은 DB 로더(주입). 모델 호출 없음.
// 흐름: ① 병목 장이 정해지면 그 장 라벨이 붙은 카드(스토리×장)를 모은다 → ② 이 회사와 상황·원인·환경이 가장 비슷한 것 → ③ 그중 가장 설득력 있는 것
// → ④ 추천 1건 + 대안 2건, 건마다 "비슷한 이유"·"설득력 이유" 한 줄(근거 라벨에서만). 모름은 거르지 않고 감점. 거르는 것은 결과 없음·근거 없음뿐.
// 규칙: signal·none 은 "됐다"로 쓰지 않는다 / "N곳 중 M곳" 비율 문장은 R10 전까지 만들지 않는다 / 원리 태그(mechanism) 없는 다른 업종 카드는 쓰지 않는다.
// 깃발 STORY_FLOW_ENABLED 가 'true' 가 아니면 loadStoryFlow 는 {status:'off'} — 호출자는 기존 경로를 그대로 쓴다(11/18·11/19 발송분 보호).
import type { SupabaseClient } from '@supabase/supabase-js'

export type Episode = {
  episode_idx: number; chapter: number; role: 'primary' | 'secondary'; sub_topic: string | null
  adversity_ko: string | null; action_ko: string | null; overcome_ko: string | null
  result_class: 'positive' | 'negative' | 'mixed' | 'none' | 'unknown'; result_grain: 'metric' | 'qual' | 'signal' | 'learned' | null
  result_ko: string | null; why_ko: string | null; condition_ko: string | null; mechanism: string | null
  quote_orig: string | null; quote_ko: string | null; evidence_strength: 'A' | 'B' | 'C'
}
export type FlowCard = {
  slug: string; chapter: number; weight: number; chapter_why_ko: string | null
  customer: string; pricing_model: string; price_band: string; stage: string; team_size: string; domain: string | null
  story_arc_ko: string | null; causal_chain: { from_ep: number; to_ep: number; because_ko: string }[]
  success_tier: string; relevance_tier: 'R1' | 'R2' | 'R3'; principle_ko: string | null; transfer_ko: string | null
  episodes: Episode[]; created_at?: string
}
export type Diagnosis = {
  chapter: number
  situation: { customer?: string; pricing_model?: string; price_band?: string; stage?: string; team_size?: string }
  adversity?: string   // 이 회사가 막힌 원인을 적은 글(역경 텍스트 일치용)
  mechanism?: string   // 알고 있으면(예: 진단이 정한 원리 태그)
}
export type FlowPick = { card: FlowCard; similarity: number; persuasion: number; similarWhy: string; persuasiveWhy: string; crossIndustry: boolean; hasFailure: boolean }
export type FlowResult = { status: 'ok' | 'insufficient' | 'off' | 'not_run'; recommended?: FlowPick; alternatives: FlowPick[]; considered: number; note: string }

/** 진단 병목 → 장(v71ct §4-4). 하나가 아니면 앞이 주된 장. */
export const BOTTLENECK_CHAPTERS: Record<string, number[]> = {
  not_arriving: [5], no_signup: [6, 5], not_using: [7, 4], not_paying: [6], churn: [7], new_channels: [5],
}

const GRAIN_SCORE: Record<string, number> = { metric: 1, qual: 0.6, learned: 0.5, signal: 0 }
const EVID: Record<string, number> = { A: 1, B: 0.6, C: 0.3 }
const COUNTED = new Set(['positive', 'negative', 'mixed'])

/** 한 카드가 장 c 에서 쓸 수 있는가: 비중 ≥ 30, 그 장 에피소드 중 결과가 positive·negative·mixed 인 것 ≥ 1. 결과 없음·근거 없음만 거른다. */
export function eligible(card: FlowCard, chapter: number): boolean {
  return card.chapter === chapter && card.weight >= 30 && card.episodes.some((e) => COUNTED.has(e.result_class))
}

const known = (v?: string) => v != null && v !== '' && v !== 'unknown'
/** 상황 일치(0~1): 칸마다 같으면 1, 어느 한쪽이 모름이면 0.5(감점), 둘 다 알고 다르면 0. */
export function situationMatch(card: FlowCard, s: Diagnosis['situation']): number {
  const pairs: [string | undefined, string][] = [[s.customer, card.customer], [s.price_band, card.price_band], [s.stage, card.stage], [s.team_size, card.team_size], [s.pricing_model, card.pricing_model]]
  const vals: number[] = pairs.map(([a, b]) => (known(a) && known(b) ? (a === b ? 1 : 0) : 0.5))
  return vals.reduce((x, y) => x + y, 0) / vals.length
}
const tok = (t: string) => new Set(t.toLowerCase().match(/[a-z0-9가-힣]{2,}/g) ?? [])
function overlap(a: string | undefined, b: string): number {
  if (!a) return 0.5 // 진단에 원인 글이 없으면 중립
  const x = tok(a), y = tok(b); if (!x.size || !y.size) return 0.5
  const i = [...x].filter((t) => y.has(t)).length
  return i / Math.min(x.size, y.size)
}
const chapterEps = (card: FlowCard) => card.episodes.filter((e) => e.chapter === card.chapter)

/** 비슷함(0~1): 상황 0.6 + 역경 텍스트 0.25 + mechanism 0.15. 모름은 감점이지 탈락이 아니다. */
export function similarity(card: FlowCard, d: Diagnosis): number {
  const eps = chapterEps(card)
  const adv = Math.max(0, ...eps.map((e) => overlap(d.adversity, e.adversity_ko ?? '')))
  const mech = d.mechanism ? (eps.some((e) => e.mechanism === d.mechanism) ? 1 : 0) : 0.5
  return 0.6 * situationMatch(card, d.situation) + 0.25 * adv + 0.15 * mech
}
export const hasFailureEp = (card: FlowCard) => chapterEps(card).some((e) => e.result_class === 'negative' || e.result_class === 'mixed')
/** 설득력(0~1): 결과 grain(metric>qual>signal)·증거 등급·인과 사슬 완결·"안 된 시도" 포함·조건 명시. */
export function persuasion(card: FlowCard): number {
  const eps = chapterEps(card).filter((e) => COUNTED.has(e.result_class))
  const grain = Math.max(0, ...eps.map((e) => GRAIN_SCORE[e.result_grain ?? ''] ?? 0))
  const ev = Math.max(0, ...eps.map((e) => EVID[e.evidence_strength] ?? 0))
  const chain = card.causal_chain.length >= 1 ? 1 : 0
  const cond = eps.some((e) => e.condition_ko) ? 1 : 0
  return 0.35 * grain + 0.25 * ev + 0.2 * chain + 0.1 * (hasFailureEp(card) ? 1 : 0) + 0.1 * cond
}

/** 결론서 문장에 "됐다"를 써도 되는 에피소드: positive 이고 grain 이 metric·qual 일 때만. signal·none·learned 는 안 된다. */
export const mayClaimSuccess = (e: Pick<Episode, 'result_class' | 'result_grain'>) => e.result_class === 'positive' && (e.result_grain === 'metric' || e.result_grain === 'qual')

/** 다른 업종이어도 원리가 같으면 표시. 원리 태그(mechanism)가 없으면 다른 업종 카드는 쓰지 않는다. */
const crossOk = (card: FlowCard) => card.relevance_tier === 'R1' || chapterEps(card).some((e) => e.mechanism)

function similarWhy(card: FlowCard, d: Diagnosis, cross: boolean): string {
  const s = d.situation, same: string[] = []
  if (known(s.customer) && s.customer === card.customer) same.push('손님')
  if (known(s.price_band) && s.price_band === card.price_band) same.push('값대')
  if (known(s.stage) && s.stage === card.stage) same.push('단계')
  if (known(s.team_size) && s.team_size === card.team_size) same.push('팀 크기')
  const m = d.mechanism && chapterEps(card).find((e) => e.mechanism === d.mechanism)?.mechanism
  const parts = [same.length ? `${same.join('·')}이 같다` : '', m ? '같은 원리(' + m + ')를 쓴다' : '']
  const head = cross ? '다른 업종, 같은 원리: ' : ''
  return head + (parts.filter(Boolean).join(', ') || '같은 장에서 비슷한 막힘을 겪었다')
}
function persuasiveWhy(card: FlowCard): string {
  const eps = chapterEps(card).filter((e) => COUNTED.has(e.result_class)).sort((a, b) => (GRAIN_SCORE[b.result_grain ?? ''] ?? 0) - (GRAIN_SCORE[a.result_grain ?? ''] ?? 0))
  const e = eps[0], bits: string[] = []
  if (e?.result_grain === 'metric') bits.push('숫자로 확인된 결과')
  else if (e?.result_grain === 'qual') bits.push('말로 확인된 결과(숫자는 없다)')
  if (e && (e.evidence_strength === 'A')) bits.push('증거 등급 A')
  if (card.causal_chain.length) bits.push('이유가 사슬로 적혀 있다')
  if (hasFailureEp(card)) bits.push('안 된 시도도 함께 담겨 있다')
  if (eps.some((x) => x.condition_ko)) bits.push('통하는 조건이 적혀 있다')
  return bits.join(', ') || '결과가 원문에 적혀 있다'
}

/**
 * 순수 — 카드들 + 진단 → 추천 1 + 대안 2(②·③ 순서). 후보 < 3 이면 status=insufficient(호출자가 기존 경로로 폴백).
 * 상위 유사 10개 안에서 설득력 순으로 고른다. 안 된 시도가 든 카드가 후보에 있으면 3건 안에 1건 이상 넣는다.
 */
export function pickFlowCards(cards: FlowCard[], d: Diagnosis, limit = 3): FlowResult {
  const pool = cards.filter((c) => eligible(c, d.chapter) && crossOk(c))
  if (pool.length < limit) return { status: 'insufficient', alternatives: [], considered: pool.length, note: `사례 부족 — 장 ${d.chapter} 카드 ${pool.length}건(${limit}건 미만)` }
  const scored = pool.map((c) => ({ c, sim: similarity(c, d), per: persuasion(c) }))
    // R1(SaaS)은 가중치일 뿐 문이 아니다 — 같은 비슷함이면 R1 이 앞선다.
    .sort((a, b) => b.sim - a.sim || (a.c.relevance_tier < b.c.relevance_tier ? -1 : 1) || (a.c.slug < b.c.slug ? -1 : 1))
  const top = scored.slice(0, 10).sort((a, b) => b.per - a.per || b.sim - a.sim || (a.c.slug < b.c.slug ? -1 : 1))
  let chosen = top.slice(0, limit)
  if (!chosen.some((x) => hasFailureEp(x.c))) {
    const f = top.slice(limit).find((x) => hasFailureEp(x.c)) ?? scored.slice(10).find((x) => hasFailureEp(x.c))
    if (f) chosen = [...chosen.slice(0, limit - 1), f]
  }
  const mk = ({ c, sim, per }: (typeof scored)[number]): FlowPick => {
    const cross = c.relevance_tier !== 'R1'
    return { card: c, similarity: Number(sim.toFixed(3)), persuasion: Number(per.toFixed(3)), similarWhy: similarWhy(c, d, cross), persuasiveWhy: persuasiveWhy(c), crossIndustry: cross, hasFailure: hasFailureEp(c) }
  }
  const picks = chosen.map(mk)
  return { status: 'ok', recommended: picks[0], alternatives: picks.slice(1), considered: pool.length, note: `장 ${d.chapter} 후보 ${pool.length}건 중 ${picks.length}건` }
}

export const storyFlowEnabled = () => process.env.STORY_FLOW_ENABLED === 'true'

/** DB 로더 — story_flow_cards 에서 한 장의 카드를 읽는다. 깃발이 꺼져 있으면 읽지 않고 off. 오류는 던지지 않고 not_run(확인 불가 ≠ 근거 부족, §7.1). */
export async function loadStoryFlow(sb: Pick<SupabaseClient, 'from'>, d: Diagnosis): Promise<FlowResult> {
  if (!storyFlowEnabled()) return { status: 'off', alternatives: [], considered: 0, note: 'STORY_FLOW_ENABLED 꺼짐' }
  try {
    const cards: FlowCard[] = []
    for (let p = 0; ; p++) {
      const { data, error } = await sb.from('story_flow_cards').select('*').eq('chapter', d.chapter).gte('weight', 30).range(p * 1000, p * 1000 + 999)
      if (error) throw new Error(error.message)
      cards.push(...((data ?? []) as FlowCard[])); if (!data || data.length < 1000) break
    }
    return pickFlowCards(cards, d)
  } catch (e) {
    console.error(`story-flow load failed: ${e instanceof Error ? e.message : e}`)
    return { status: 'not_run', alternatives: [], considered: 0, note: '확인 불가 — 흐름 카드를 조회하지 못했습니다' }
  }
}
