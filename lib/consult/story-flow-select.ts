// [v71cu 2-3~2-8] story flow 선택 v2 — 점수식(scoreCard)·회사당 1장·안 된 시도 포함·폴백(ss_move_tags_current → case_bank)·결론서 연결·인용 검증.
// 기존 story-flow.ts 의 similarity/persuasion/pickFlowCards 는 그대로 둔다(loadStoryFlow 가 계속 쓴다). 이 파일은 새 경로이며 깃발 STORY_FLOW_ENABLED='true' 일 때만 결론서가 부른다.
// DB 조회는 전부 주입(loaders) — 순수 함수만 테스트한다. 모델 호출 없음.
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  type Diagnosis, type Episode, type FlowCard, BOTTLENECK_CHAPTERS, COUNTED, EVID,
  chapterEps, crossOk, eligible, fetchFlowCards, hasFailureEp, persuasion, persuasiveWhy, similarWhy, situationMatch, storyFlowEnabled,
} from './story-flow.ts'

export type Source = 'story_flow' | 'move_tags' | 'case_bank'
export type Quote = { slug: string; episode_idx: number; text: string }
export type ScoredPick = {
  source: Source; slug: string; name: string; chapter: number
  score: number; situation: number; persuasion: number
  reasons: [string, string]   // [비슷한 이유, 설득력 이유] — 근거 라벨에서만 만든다
  hasFailure: boolean; crossIndustry: boolean; quote: Quote | null; summary_ko: string
}
export type Selection = {
  status: 'ok' | 'insufficient' | 'not_run' | 'no_chapter'
  recommended?: ScoredPick; alternatives: ScoredPick[]
  considered: Record<Source, number>; note: string
}
export type StoryDiagnosis = Diagnosis & { chapters?: number[] }   // 병목이 장 여러 개면 앞이 주된 장
export type Loaders = {
  flowCards: (chapter: number) => Promise<FlowCard[]>
  moveTags?: (chapter: number) => Promise<FlowCard[]>
  caseBank?: (chapter: number) => Promise<FlowCard[]>
}

// ── 2-3 점수식 ──────────────────────────────────────────────────────────────
export const W = { weight: 0.35, situation: 0.30, mechanism: 0.15, evidence: 0.15, recency: 0.05 } as const
const RECENCY_YEARS = 3 // ponytail: 꼬리표 단 시각 기준 3년 선형 감쇠 — 원 게시일 칸이 생기면 그것으로 바꾼다.

/** 증거(0~1): 그 장 결과 있는 에피소드 중 최댓값. A=1 B=0.6 C=0.3, 결과 grain 이 signal 이면 0. */
export function evidenceScore(card: FlowCard): number {
  const eps = chapterEps(card).filter((e) => COUNTED.has(e.result_class))
  return Math.max(0, ...eps.map((e) => (e.result_grain === 'signal' ? 0 : EVID[e.evidence_strength] ?? 0)))
}
/** mechanism 일치(0~1): 진단에 원리가 없으면 모름=0.5, 있으면 그 장 에피소드에 같은 원리가 있을 때 1. */
export const mechanismScore = (card: FlowCard, d: Diagnosis) => (d.mechanism ? (chapterEps(card).some((e) => e.mechanism === d.mechanism) ? 1 : 0) : 0.5)
/** 최신성(0~1): created_at 이 없으면 모름=0.5. */
export function recencyScore(card: FlowCard, now: Date): number {
  const t = card.created_at ? Date.parse(card.created_at) : NaN
  if (!Number.isFinite(t)) return 0.5
  const years = (now.getTime() - t) / (365.25 * 864e5)
  return Math.min(1, Math.max(0, 1 - years / RECENCY_YEARS))
}
/** score = 0.35×weight/100 + 0.30×상황 일치(모름=0.5) + 0.15×mechanism 일치 + 0.15×증거 + 0.05×최신성. 0~1. */
export function scoreCard(card: FlowCard, d: Diagnosis, now = new Date()): number {
  const weight = Math.min(1, Math.max(0, card.weight / 100))
  const s = W.weight * weight + W.situation * situationMatch(card, d.situation) + W.mechanism * mechanismScore(card, d) + W.evidence * evidenceScore(card) + W.recency * recencyScore(card, now)
  return Number(s.toFixed(4))
}

/** 회사(slug)당 1장 — 가장 점수 높은 장 하나만 남긴다. */
export function dedupeBySlug<T extends { slug: string; score: number }>(xs: T[]): T[] {
  const best = new Map<string, T>()
  for (const x of xs) { const b = best.get(x.slug); if (!b || x.score > b.score) best.set(x.slug, x) }
  return [...best.values()]
}

// ── 폴백 원천을 같은 카드 모양으로 ───────────────────────────────────────────
const blankEp = (o: Partial<Episode>): Episode => ({ episode_idx: 0, chapter: 0, role: 'primary', sub_topic: null, adversity_ko: null, action_ko: null, overcome_ko: null, result_class: 'unknown', result_grain: null, result_ko: null, why_ko: null, condition_ko: null, mechanism: null, quote_orig: null, quote_ko: null, evidence_strength: 'C', ...o })
const blankCard = (o: Partial<FlowCard> & { slug: string; chapter: number }): FlowCard => ({ weight: 50, chapter_why_ko: null, customer: 'unknown', pricing_model: 'unknown', price_band: 'unknown', stage: 'unknown', team_size: 'unknown', domain: null, story_arc_ko: null, causal_chain: [], success_tier: 'S0', relevance_tier: 'R1', principle_ko: null, transfer_ko: null, episodes: [], ...o })

export type MoveTagRow = { slug: string; company?: string | null; chapter: string; stage: string; team_size: string; customer: string; price_band: string; action_kind?: string | null; result_class: string; result_ko: string | null; why_worked_ko?: string | null; condition_ko: string | null; evidence_strength: string; created_at?: string }
/** ss_move_tags_current 한 줄 → 카드(장 비중을 모르므로 weight=50=모름). 영어 원문 인용 없음(그 표에 없다). */
export function cardFromMoveTag(r: MoveTagRow): FlowCard {
  const ch = Number(r.chapter)
  return blankCard({ slug: r.slug, chapter: ch, customer: r.customer, price_band: r.price_band, stage: r.stage, team_size: r.team_size, created_at: r.created_at, transfer_ko: r.company ?? null,
    episodes: [blankEp({ chapter: ch, action_ko: r.action_kind ?? null, result_class: r.result_class as Episode['result_class'], result_ko: r.result_ko, why_ko: r.why_worked_ko ?? null, condition_ko: r.condition_ko, evidence_strength: (['A', 'B', 'C'].includes(r.evidence_strength) ? r.evidence_strength : 'C') as Episode['evidence_strength'] })] })
}
export type CaseBankRow = { company: string | null; key_decision: string | null; outcome: string | null; grade: string | null }
const OUTCOME: Record<string, Episode['result_class']> = { success: 'positive', succeeded: 'positive', failure: 'negative', failed: 'negative', mixed: 'mixed' }
/** case_bank 한 줄 → 카드(상황 전부 모름, 장은 병목 장으로 둔다). 결과를 못 읽으면 eligible 에서 걸러진다. */
export function cardFromCaseBank(r: CaseBankRow, chapter: number): FlowCard | null {
  const name = (r.company ?? '').trim(); if (!name || !(r.key_decision ?? '').trim()) return null
  return blankCard({ slug: `case_bank:${name.toLowerCase()}`, chapter, transfer_ko: name,
    episodes: [blankEp({ chapter, action_ko: r.key_decision, result_class: OUTCOME[(r.outcome ?? '').toLowerCase()] ?? 'unknown', result_grain: 'qual', evidence_strength: (['A', 'B'].includes(r.grade ?? '') ? r.grade : 'C') as Episode['evidence_strength'] })] })
}

// ── 2-4·2-5 선택 ────────────────────────────────────────────────────────────
function firstQuote(card: FlowCard): Quote | null {
  const e = chapterEps(card).find((x) => COUNTED.has(x.result_class) && x.quote_orig)
  return e ? { slug: card.slug, episode_idx: e.episode_idx, text: e.quote_orig as string } : null
}
function toPick(card: FlowCard, d: Diagnosis, source: Source, now: Date): ScoredPick {
  const cross = source === 'story_flow' && card.relevance_tier !== 'R1'
  const e = chapterEps(card).find((x) => COUNTED.has(x.result_class))
  return {
    source, slug: card.slug, name: card.transfer_ko && source !== 'story_flow' ? card.transfer_ko : card.slug, chapter: card.chapter,
    score: scoreCard(card, d, now), situation: Number(situationMatch(card, d.situation).toFixed(3)), persuasion: Number(persuasion(card).toFixed(3)),
    reasons: [similarWhy(card, d, cross), persuasiveWhy(card)], hasFailure: hasFailureEp(card), crossIndustry: cross,
    quote: source === 'story_flow' ? firstQuote(card) : null,
    summary_ko: [e?.action_ko, e?.result_ko].filter(Boolean).join(' → ').slice(0, 110) || '결과 요약 없음',
  }
}
/** 정렬: 병목 장(주된 장 먼저) → 점수(비중·상황·원리·증거·최신성) → 상황 일치 → 설득력 → slug. */
function rank(xs: ScoredPick[], chapters: number[]): ScoredPick[] {
  const ci = (c: number) => { const i = chapters.indexOf(c); return i < 0 ? 99 : i }
  return [...xs].sort((a, b) => ci(a.chapter) - ci(b.chapter) || b.score - a.score || b.situation - a.situation || b.persuasion - a.persuasion || (a.slug < b.slug ? -1 : 1))
}
const empty = (): Record<Source, number> => ({ story_flow: 0, move_tags: 0, case_bank: 0 })

/**
 * 추천 1 + 대안 2. story flow 카드가 3장 이상이면 story flow 만 쓴다. 모자라면 ss_move_tags_current → case_bank 순서로 채운다.
 * 후보가 2장 이상이고 "안 된 시도"(negative·mixed) 카드가 후보에 있으면 3건 안에 1건 이상 넣는다.
 * flowCards 조회 실패 = not_run(근거 부족으로 접지 않는다, §7.1). 폴백 조회 실패는 그 원천만 건너뛰고 note 에 남긴다.
 */
export async function selectStoryFlow(d: StoryDiagnosis, loaders: Loaders, opts: { now?: Date; limit?: number } = {}): Promise<Selection> {
  const now = opts.now ?? new Date(), limit = opts.limit ?? 3
  const chapters = d.chapters?.length ? d.chapters : [d.chapter]
  const considered = empty(), errors: string[] = []
  let flow: ScoredPick[] = []
  try {
    for (const ch of chapters) {
      const cd = { ...d, chapter: ch }
      flow.push(...(await loaders.flowCards(ch)).filter((c) => eligible(c, ch) && crossOk(c)).map((c) => toPick(c, cd, 'story_flow', now)))
    }
  } catch (e) {
    return { status: 'not_run', alternatives: [], considered, note: `확인 불가 — 흐름 카드를 조회하지 못했습니다(${e instanceof Error ? e.message : e})` }
  }
  flow = rank(dedupeBySlug(flow), chapters); considered.story_flow = flow.length

  let pool = flow
  if (flow.length < limit) {
    const used = new Set(flow.map((x) => x.slug))
    for (const [src, load] of [['move_tags', loaders.moveTags], ['case_bank', loaders.caseBank]] as const) {
      if (pool.length >= limit || !load) continue
      try {
        const extra = rank(dedupeBySlug((await load(d.chapter)).filter((c) => eligible(c, d.chapter) && !used.has(c.slug)).map((c) => toPick(c, d, src, now))), chapters)
        considered[src] = extra.length
        extra.forEach((x) => used.add(x.slug))
        pool = [...pool, ...extra]
      } catch (e) { errors.push(`${src} 조회 실패: ${e instanceof Error ? e.message : e}`) }
    }
  }
  let chosen = pool.slice(0, limit)
  if (pool.length >= 2 && !chosen.some((x) => x.hasFailure)) {
    const f = pool.slice(limit).find((x) => x.hasFailure)
    if (f) chosen = [...chosen.slice(0, Math.min(limit, chosen.length) - 1), f]
  }
  const src = [...new Set(chosen.map((x) => x.source))].join('+') || '없음'
  const note = `장 ${chapters.join('·')} · story flow ${considered.story_flow} · 꼬리표 ${considered.move_tags} · 사례 은행 ${considered.case_bank} → ${chosen.length}건(${src})${errors.length ? ' · ' + errors.join(' / ') : ''}`
  if (chosen.length < limit) return { status: errors.length ? 'not_run' : 'insufficient', alternatives: chosen, considered, note: `사례 부족 — ${note}` }
  return { status: 'ok', recommended: chosen[0], alternatives: chosen.slice(1), considered, note }
}

// ── 2-6 결론서 연결 ─────────────────────────────────────────────────────────
/** 1장 Fit 사슬의 끊긴 단계 → 장. ponytail: 지시서 §4-4 는 상황 질문의 병목(BOTTLENECK_CHAPTERS)이 정본이고, 콜드메일 결론서엔 그 답이 없어 Fit 단계로 임시 대응한다. 0·⬜ 는 장을 정하지 않는다. */
export const FIT_STAGE_CHAPTERS: Record<number, number[]> = { 1: [4], 2: [5], 3: [6], 4: [7] }
export const BOTTLENECK_ANSWER: Record<string, keyof typeof BOTTLENECK_CHAPTERS> = { '방문하는 사람이 적다': 'not_arriving', '와서 가입을 안 한다': 'no_signup', '가입하고 쓰다 만다': 'not_using', '써 보고 돈은 안 낸다': 'not_paying' }
const RUN_STAGE: Record<string, string> = { '0': 'zero_rev', 소액: 'early_rev', 중간: 'early_rev', 충분: 'growing' }

export function diagnosisFromReport(i: { bottleneck?: string | null; viability?: { fit_broken_stage: number; fit_color: string } | null; launched?: boolean | null; revenue_band?: string | null; adversity?: string }): StoryDiagnosis | null {
  const key = i.bottleneck ? BOTTLENECK_ANSWER[i.bottleneck] : undefined
  const chapters = key ? BOTTLENECK_CHAPTERS[key] : i.viability && i.viability.fit_color !== '⬜' ? FIT_STAGE_CHAPTERS[i.viability.fit_broken_stage] : undefined
  if (!chapters?.length) return null
  const stage = i.launched === false ? 'prelaunch' : (i.revenue_band && RUN_STAGE[i.revenue_band]) || undefined
  return { chapter: chapters[0], chapters, situation: stage ? { stage } : {}, adversity: i.adversity }
}

/** 결론서 ch1.similar 와 같은 모양(name·what·why). 화면은 이 세 칸만 그린다 — 영어 원문 인용(quote)은 payload.story_flow 에만 남는다. */
export const selectionToSimilar = (s: Selection) => (s.recommended ? [s.recommended, ...s.alternatives] : []).map((p) => ({ name: p.name, what: p.summary_ko, why: `${p.reasons[0]} / ${p.reasons[1]}`.slice(0, 120) }))

/**
 * 깃발 분기 한 곳. 깃발이 'true' 가 아니면 story flow 를 부르지 않고 legacy() 결과를 그대로 돌려준다(기존 경로 100%).
 * 깃발이 켜져 있어도 선택이 ok 가 아니면 legacy() 로 폴백한다. storyFlow 는 실행한 경우에만 돌려준다(payload 기록용).
 */
export async function chooseSimilar<T>(i: { legacy: () => Promise<T[]>; storyFlow: () => Promise<Selection>; toItems: (s: Selection) => T[]; enabled?: boolean }): Promise<{ similar: T[]; storyFlow?: Selection }> {
  if (!(i.enabled ?? storyFlowEnabled())) return { similar: await i.legacy() }
  const sf = await i.storyFlow()
  return sf.status === 'ok' ? { similar: i.toItems(sf), storyFlow: sf } : { similar: await i.legacy(), storyFlow: sf }
}

/** 실제 DB 로더(service_role). 결론서 생성기가 쓴다 — 셀프테스트는 주입 가짜를 쓴다. */
export function dbLoaders(sb: Pick<SupabaseClient, 'from' | 'rpc'>): Loaders {
  return {
    flowCards: (ch) => fetchFlowCards(sb, ch),
    moveTags: async (ch) => {
      const { data, error } = await sb.from('ss_move_tags_current').select('move_id,chapter,stage,team_size,customer,price_band,action_kind,result_class,result_ko,why_worked_ko,condition_ko,evidence_strength,created_at').eq('chapter', String(ch)).in('result_class', ['positive', 'negative', 'mixed']).limit(300)
      if (error) throw new Error(error.message)
      const ids = [...new Set((data ?? []).map((r) => r.move_id as string))]
      if (!ids.length) return []
      const { data: mv, error: e2 } = await sb.from('ss_moves').select('id,slug,company').in('id', ids)
      if (e2) throw new Error(e2.message)
      const by = new Map((mv ?? []).map((m) => [m.id as string, m as { slug: string; company: string | null }]))
      return (data ?? []).flatMap((r) => { const m = by.get(r.move_id as string); return m ? [cardFromMoveTag({ ...(r as unknown as MoveTagRow), slug: m.slug, company: m.company })] : [] })
    },
    caseBank: async (ch) => {
      const { data, error } = await sb.rpc('case_retrieve', { p_category: null, p_mechanism: null, p_outcome: null, p_decision_keyword: null, p_limit: 30 })
      if (error) throw new Error(error.message)
      return ((Array.isArray(data) ? data : []) as CaseBankRow[]).flatMap((r) => { const c = cardFromCaseBank(r, ch); return c ? [c] : [] })
    },
  }
}

// ── 2-8 인용 검증 ───────────────────────────────────────────────────────────
const norm = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim()
export type QuoteCheck = { checked: number; mismatches: { slug: string; episode_idx: number; reason: 'source_missing' | 'episode_missing' | 'text_differs'; text: string }[] }
/** 결론서(또는 Selection) 안의 모든 사례 인용을 원문 quote_orig 와 대조한다. 원문을 못 찾으면 불일치(확인 불가를 통과로 접지 않는다). */
export function collectQuotes(x: unknown): Quote[] {
  const out: Quote[] = []
  const walk = (v: unknown) => {
    if (!v || typeof v !== 'object') return
    if (Array.isArray(v)) { v.forEach(walk); return }
    const o = v as Record<string, unknown>
    if (o.quote && typeof o.quote === 'object' && typeof (o.quote as Quote).text === 'string') out.push(o.quote as Quote)
    for (const [k, val] of Object.entries(o)) if (k !== 'quote') walk(val)
  }
  walk(x)
  return out
}
export function verifyQuotes(payload: unknown, source: Record<string, Pick<Episode, 'episode_idx' | 'quote_orig'>[]>): QuoteCheck {
  const quotes = collectQuotes(payload), mismatches: QuoteCheck['mismatches'] = []
  for (const q of quotes) {
    const eps = source[q.slug]
    if (!eps) { mismatches.push({ ...q, reason: 'source_missing' }); continue }
    const e = eps.find((x) => x.episode_idx === q.episode_idx)
    if (!e || !e.quote_orig) { mismatches.push({ ...q, reason: 'episode_missing' }); continue }
    if (!norm(e.quote_orig).includes(norm(q.text)) || !norm(q.text)) mismatches.push({ ...q, reason: 'text_differs' })
  }
  return { checked: quotes.length, mismatches }
}
