// [v71cu 2-3~2-8] story flow 선택 v2 — 점수식(scoreCard)·회사당 1장·안 된 시도 포함·폴백(ss_move_tags_current → case_bank)·결론서 연결·인용 검증.
// 기존 story-flow.ts 의 similarity/persuasion/pickFlowCards 는 그대로 둔다(loadStoryFlow 가 계속 쓴다). 이 파일은 새 경로이며 깃발 STORY_FLOW_ENABLED='true' 일 때만 결론서가 부른다.
// DB 조회는 전부 주입(loaders) — 순수 함수만 테스트한다. 모델 호출 없음.
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  type Diagnosis, type Episode, type FlowCard, BOTTLENECK_CHAPTERS, COUNTED, EVID, GRAIN_SCORE,
  chapterEps, crossOk, eligible, fetchFlowCards, hasFailureEp, known, persuasion, situationMatch, storyFlowEnabled,
} from './story-flow.ts'
import { topicMatch, type TopicProfile } from './story-flow-topic.ts'

export type Source = 'story_flow' | 'move_tags' | 'case_bank'
// [G4] 저장본(payload.story_flow)의 slug·name 에는 UUID 가 든 slug 원문을 두지 않는다. 원문 추적은 slug_internal(내부 키 — 화면 렌더 경로 selectionToSimilar 는 읽지 않는다).
export type Quote = { slug?: string; slug_internal?: string; episode_idx: number; text: string; source_key?: string; label_run?: string }
export type ScoredPick = {
  source: Source; slug: string; slug_internal: string; name: string; chapter: number
  score: number; situation: number; persuasion: number; evidence: number; stage: string
  failed: boolean; fail_kind: 'negative' | 'mixed' | null   // [G1] 기준 에피소드가 안 된 시도 — 화면 문구에 표시가 붙는다
  reasons: [string, string]   // [비슷한 이유, 설득력 이유] — 근거 라벨에서만 만든다
  hasFailure: boolean; crossIndustry: boolean; quote: Quote | null; summary_ko: string
  topic?: number   // [B2] 주제 일치(opts.topic 일 때만)
}
export type Selection = {
  status: 'ok' | 'insufficient' | 'not_run' | 'no_chapter'
  recommended?: ScoredPick; alternatives: ScoredPick[]
  considered: Record<Source, number>; note: string
}
export type StoryDiagnosis = Diagnosis & { chapters?: number[]; topic?: TopicProfile; enrich_basis?: Record<string, string> }   // 병목이 장 여러 개면 앞이 주된 장. topic·enrich_basis 는 [B1] enrichDiagnosis 가 채운다
/** [B2] 선택 옵션. 전부 기본 OFF = 기존 동작 그대로(compose.ts 는 아무것도 넘기지 않는다).
 * - stageFirst: [G3] 추천 자리 단계 우선
 * - topic: 사업 설명 ↔ 카드 주제 일치를 상황 일치 항(0.30) 안의 6번째 칸으로 넣는다. 진단에 topic 신호가 없으면 효과 0(기존 5칸 평균 그대로). */
export type SelectOpts = { now?: Date; limit?: number; stageFirst?: boolean; topic?: boolean }
/** [B3] 권장 설정(남헌 결정 B안 — 켜는 결정은 따로): 단계 우선 ON + 주제 신호 ON. 진단은 enrichDiagnosis 로 채워서 넘긴다. */
export const STORY_FLOW_B_OPTS = { stageFirst: true, topic: true } as const satisfies SelectOpts
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
/** [B2] 상황 일치 — topic 이 참이고 진단에 주제 신호가 있으면 기존 5칸(손님·값대·단계·팀·과금)에 주제 일치 1칸을 더한 6칸 평균, 아니면 기존 situationMatch 그대로. 가중치 0.30 은 불변. */
export function situationWithTopic(card: FlowCard, d: StoryDiagnosis, topic = false): number {
  const base = situationMatch(card, d.situation)
  if (!topic || !d.topic || (!d.topic.concepts.length && !d.topic.tokens.length)) return base
  return (base * 5 + topicMatch(card, d.topic)) / 6
}
/** score = 0.35×weight/100 + 0.30×상황 일치(모름=0.5) + 0.15×mechanism 일치 + 0.15×증거 + 0.05×최신성. 0~1. [B2] opts.topic 이면 상황 일치에 주제 칸이 들어간다(상수 불변). */
export function scoreCard(card: FlowCard, d: StoryDiagnosis, now = new Date(), opts: { topic?: boolean } = {}): number {
  const weight = Math.min(1, Math.max(0, card.weight / 100))
  const s = W.weight * weight + W.situation * situationWithTopic(card, d, opts.topic) + W.mechanism * mechanismScore(card, d) + W.evidence * evidenceScore(card) + W.recency * recencyScore(card, now)
  return Number(s.toFixed(4))
}

/** 회사(slug)당 1장 — 가장 점수 높은 장 하나만 남긴다. */
export function dedupeBySlug<T extends { slug: string; score: number }>(xs: T[], key: (x: T) => string = (x) => x.slug): T[] {
  const best = new Map<string, T>()
  for (const x of xs) { const k = key(x), b = best.get(k); if (!b || x.score > b.score) best.set(k, x) }
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
type SrcCard = FlowCard & { source_key?: string; label_run?: string }
type SrcEp = Episode & { source_key?: string; label_run?: string }

/** [F3] 인용·카드로 내보내도 되는 story flow 원천(source_key). 기본 starterstory 하나. 넓히려면 env STORY_FLOW_QUOTE_SOURCES(쉼표) — 그 소스의 quote_policy 를 먼저 확인한다. source_key 가 없는 카드는 막는다(fail-closed). */
export const QUOTE_SOURCE_ALLOWLIST = ['starterstory'] as const
export const quoteSources = (): Set<string> => new Set((process.env.STORY_FLOW_QUOTE_SOURCES ?? '').split(',').map((x) => x.trim()).filter(Boolean).concat(QUOTE_SOURCE_ALLOWLIST))
export const sourceAllowed = (card: SrcCard, allow = quoteSources()) => !!card.source_key && allow.has(card.source_key)

/** [F1] 받침 있으면 '이', 없으면 '가'(한글이 아니면 '가'). 예: 손님이 · 팀 크기가 · 단계가. */
export function iGa(word: string): string {
  const c = word.trim().slice(-1).charCodeAt(0)
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 !== 0 ? '이' : '가'
}
/** [F1] 한 카드의 기준 에피소드 하나 — 요약·인용·설득력 이유를 모두 여기서 뽑는다. 결과 grain(metric>qual>learned>signal) → 증거 → 원문 있음 → 번호 순. */
export function anchorEpisode(card: FlowCard): Episode | undefined {
  return chapterEps(card).filter((e) => COUNTED.has(e.result_class))
    .sort((a, b) => (GRAIN_SCORE[b.result_grain ?? ''] ?? 0) - (GRAIN_SCORE[a.result_grain ?? ''] ?? 0) || (EVID[b.evidence_strength] ?? 0) - (EVID[a.evidence_strength] ?? 0) || Number(!!b.quote_orig) - Number(!!a.quote_orig) || a.episode_idx - b.episode_idx)[0]
}
/** [F1] 비슷한 이유. "같은 원리" 는 진단 원리가 있고 기준 에피소드의 원리와 정말 같을 때만. 다른 업종인데 원리가 확인되지 않으면 "다른 업종:" 만. */
export function similarWhyV2(card: FlowCard, d: Diagnosis, e: Episode | undefined): string {
  const s = d.situation, same: string[] = []
  if (known(s.customer) && s.customer === card.customer) same.push('손님')
  if (known(s.price_band) && s.price_band === card.price_band) same.push('값대')
  if (known(s.stage) && s.stage === card.stage) same.push('단계')
  if (known(s.team_size) && s.team_size === card.team_size) same.push('팀 크기')
  const mech = !!d.mechanism && e?.mechanism === d.mechanism
  const cross = card.relevance_tier !== 'R1'
  const sameTxt = same.length ? `${same.join('·')}${iGa(same[same.length - 1])} 같다` : ''
  const parts = [sameTxt, mech ? `같은 원리(${d.mechanism})를 쓴다` : ''].filter(Boolean)
  const head = cross ? (mech ? '다른 업종, 같은 원리: ' : '다른 업종: ') : ''
  return head + (parts.join(', ') || '같은 장에서 비슷한 막힘을 겪었다')
}
/** [F1] 설득력 이유 — 기준 에피소드 하나만 본다(요약·인용과 같은 에피소드). 카드 단위 사실(인과 사슬·안 된 시도)은 그대로 붙인다. */
export function persuasiveWhyV2(card: FlowCard, e: Episode | undefined): string {
  const bits: string[] = []
  if (e?.result_grain === 'metric') bits.push('숫자로 확인된 결과')
  else if (e?.result_grain === 'qual') bits.push('말로 확인된 결과(숫자는 없다)')
  if (e?.evidence_strength === 'A') bits.push('증거 등급 A')
  if (card.causal_chain.length) bits.push('이유가 사슬로 적혀 있다')
  if (hasFailureEp(card)) bits.push('안 된 시도도 함께 담겨 있다')
  if (e?.condition_ko) bits.push('통하는 조건이 적혀 있다')
  return bits.join(', ') || '결과가 원문에 적혀 있다'
}
const UUID_TAIL = /[-_]?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HASH_TAIL = /[-_](?=[0-9a-f]*\d)[0-9a-f]{6,}$/i
/** [F2] 고객 화면용 이름 — slug 의 UUID·해시 꼬리·`case_bank:` 접두를 떼고 낱말 첫 글자를 키운다. 남는 게 없거나 여전히 기계 문자열이면 "비슷한 사례 N". */
export function displayName(raw: string, n: number): string {
  const s = (raw ?? '').replace(/^case_bank:/, '').trim().replace(UUID_TAIL, '').replace(HASH_TAIL, '').replace(/[-_]+/g, ' ').trim()
  const machine = (w: string) => /\d/.test(w) && /^[0-9a-f]{6,}$/i.test(w)
  if (!/[a-z가-힣]/i.test(s) || s.split(' ').some(machine)) return `비슷한 사례 ${n}`
  return s.replace(/(^|\s)([a-z])/g, (_, sp, ch) => sp + ch.toUpperCase()).slice(0, 60)
}

function toPick(card: SrcCard, d: StoryDiagnosis, source: Source, now: Date, topic = false): ScoredPick {
  const cross = source === 'story_flow' && card.relevance_tier !== 'R1'
  const e = anchorEpisode(card) as SrcEp | undefined
  return {
    source, slug: card.slug, slug_internal: card.slug, name: card.transfer_ko && source !== 'story_flow' ? card.transfer_ko : card.slug, chapter: card.chapter,
    score: scoreCard(card, d, now, { topic }), situation: Number(situationWithTopic(card, d, topic).toFixed(3)), persuasion: Number(persuasion(card).toFixed(3)),
    evidence: evidenceScore(card), stage: card.stage ?? 'unknown',
    failed: e?.result_class === 'negative' || e?.result_class === 'mixed', fail_kind: e?.result_class === 'negative' || e?.result_class === 'mixed' ? e.result_class : null,
    reasons: [similarWhyV2(card, d, e), persuasiveWhyV2(card, e)], hasFailure: hasFailureEp(card), crossIndustry: cross,
    quote: source === 'story_flow' && e?.quote_orig && sourceAllowed(card)
      ? { slug_internal: card.slug, episode_idx: e.episode_idx, text: e.quote_orig, source_key: e.source_key ?? card.source_key, label_run: e.label_run ?? card.label_run }
      : null,
    summary_ko: [e?.action_ko, e?.result_ko].filter(Boolean).join(' → ').slice(0, 110) || '결과 요약 없음',
    ...(topic ? { topic: topicMatch(card, d.topic) } : {}),   // [B2] 옵션 ON 일 때만 기록(검토용)
  }
}
/** 정렬: 병목 장(주된 장 먼저) → 점수. [G2] 점수가 같으면(점수 변경 아님) ([B2] 옵션 ON 이면 주제 일치 먼저) ①상황 일치 ②진단 단계와 같은 카드 ③증거 등급 ④slug. */
function rank(xs: ScoredPick[], chapters: number[], stage?: string): ScoredPick[] {
  const ci = (c: number) => { const i = chapters.indexOf(c); return i < 0 ? 99 : i }
  const st = (p: ScoredPick) => (known(stage) && p.stage === stage ? 1 : 0)
  // [B2] 주제 점수는 옵션 ON 일 때만 있다(OFF 면 둘 다 undefined → 0, 기존 순서 그대로). 점수 동점일 때 첫 기준.
  return [...xs].sort((a, b) => ci(a.chapter) - ci(b.chapter) || b.score - a.score || (b.topic ?? 0) - (a.topic ?? 0) || b.situation - a.situation || st(b) - st(a) || b.evidence - a.evidence || (a.slug_internal < b.slug_internal ? -1 : 1))
}
/** [G4] 저장용 slug — UUID·해시 꼬리를 뗀다(원문은 slug_internal). */
export const cleanSlug = (raw: string, n: number) => raw.replace(UUID_TAIL, '').replace(HASH_TAIL, '') || `case-${n}`
/** [G3] 추천 자리 선택 규칙(점수 아님, 순서 규칙, 기본 OFF — 남헌 결정 대기): 진단 단계를 알고 1순위 카드 단계가 알려진 다른 값이면, 2순위가 그렇지 않을 때 둘의 자리를 바꾼다(한 단계 아래로). */
export function stageFirst(chosen: ScoredPick[], stage?: string): ScoredPick[] {
  const off = (p?: ScoredPick) => !!p && known(stage) && known(p.stage) && p.stage !== stage
  return chosen.length >= 2 && off(chosen[0]) && !off(chosen[1]) ? [chosen[1], chosen[0], ...chosen.slice(2)] : chosen
}
const empty = (): Record<Source, number> => ({ story_flow: 0, move_tags: 0, case_bank: 0 })

/**
 * 추천 1 + 대안 2. story flow 카드가 3장 이상이면 story flow 만 쓴다. 모자라면 ss_move_tags_current → case_bank 순서로 채운다.
 * 후보가 2장 이상이고 "안 된 시도"(negative·mixed) 카드가 후보에 있으면 3건 안에 1건 이상 넣는다.
 * flowCards 조회 실패 = not_run(근거 부족으로 접지 않는다, §7.1). 폴백 조회 실패는 그 원천만 건너뛰고 note 에 남긴다.
 */
export async function selectStoryFlow(d: StoryDiagnosis, loaders: Loaders, opts: SelectOpts = {}): Promise<Selection> {
  const now = opts.now ?? new Date(), limit = opts.limit ?? 3, topic = !!opts.topic
  const chapters = d.chapters?.length ? d.chapters : [d.chapter]
  const considered = empty(), errors: string[] = [], allow = quoteSources()
  let flow: ScoredPick[] = []
  try {
    for (const ch of chapters) {
      const cd = { ...d, chapter: ch }
      flow.push(...(await loaders.flowCards(ch)).filter((c) => eligible(c, ch) && crossOk(c) && sourceAllowed(c, allow)).map((c) => toPick(c, cd, 'story_flow', now, topic)))
    }
  } catch (e) {
    return { status: 'not_run', alternatives: [], considered, note: `확인 불가 — 흐름 카드를 조회하지 못했습니다(${e instanceof Error ? e.message : e})` }
  }
  const stage = d.situation.stage
  flow = rank(dedupeBySlug(flow, (x) => x.slug_internal), chapters, stage); considered.story_flow = flow.length

  let pool = flow
  if (flow.length < limit) {
    const used = new Set(flow.map((x) => x.slug_internal))
    for (const [src, load] of [['move_tags', loaders.moveTags], ['case_bank', loaders.caseBank]] as const) {
      if (pool.length >= limit || !load) continue
      try {
        const extra = rank(dedupeBySlug((await load(d.chapter)).filter((c) => eligible(c, d.chapter) && !used.has(c.slug)).map((c) => toPick(c, d, src, now, topic)), (x) => x.slug_internal), chapters, stage)
        considered[src] = extra.length
        extra.forEach((x) => used.add(x.slug_internal))
        pool = [...pool, ...extra]
      } catch (e) { errors.push(`${src} 조회 실패: ${e instanceof Error ? e.message : e}`) }
    }
  }
  let chosen = pool.slice(0, limit)
  if (pool.length >= 2 && !chosen.some((x) => x.hasFailure)) {
    const f = pool.slice(limit).find((x) => x.hasFailure)
    if (f) chosen = [...chosen.slice(0, Math.min(limit, chosen.length) - 1), f]
  }
  if (opts.stageFirst) chosen = stageFirst(chosen, stage)
  chosen = chosen.map((p, i) => ({ ...p, slug: cleanSlug(p.slug_internal, i + 1), name: displayName(p.name, i + 1) }))
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
/** [G1] 안 된 시도 카드의 화면 표시(추천 자리든 대안이든 붙는다). */
export const FAILED_NOTE = { negative: '이 사례는 잘 안 풀린 경우입니다', mixed: '이 사례는 반쯤만 풀린 경우입니다' } as const
export const selectionToSimilar = (s: Selection) => (s.recommended ? [s.recommended, ...s.alternatives] : []).map((p, i) => ({ name: displayName(p.name, i + 1), failed: p.failed, what: p.fail_kind ? `${FAILED_NOTE[p.fail_kind]} — ${p.summary_ko}` : p.summary_ko, why: `${p.reasons[0]} / ${p.reasons[1]}`.slice(0, 120) }))

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
      const { data, error } = await sb.from('ss_move_tags_current').select('move_id,chapter,stage,team_size,customer,price_band,action_kind,result_class,result_ko,why_worked_ko,condition_ko,evidence_strength,created_at').eq('chapter', String(ch)).in('result_class', ['positive', 'negative', 'mixed']).order('move_id').limit(300)
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
export type QuoteCheck = { ok: boolean; checked: number; mismatches: { slug: string; episode_idx: number; reason: 'source_missing' | 'episode_missing' | 'text_differs' | 'not_sentence' | 'no_quotes'; text: string }[]; warnings: { slug: string; episode_idx: number; warn: 'mid_clause' | 'short_excerpt' | 'negation_nearby'; text: string }[] }
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
/** 인용이 가리키는 원문 slug — 원문 키 slug_internal 이 우선, 옛 payload 는 slug. 원본 표 조회·대조 모두 이 한 함수로(G4 뒤 조회 키 어긋남 재발 방지). */
export const quoteKey = (q: Quote) => q.slug_internal ?? q.slug ?? ''
/** --db 조회용: payload 인용들이 가리키는 원문 slug 목록(빈 값 제외). */
export const quoteSlugs = (quotes: Quote[]) => [...new Set(quotes.map(quoteKey).filter(Boolean))]
/** 원본 ss_episode_tags 줄 → verifyQuotes 의 source 모양(slug 별 에피소드 목록, source_key·label_run 포함). */
export function sourceFromRows(rows: { source_key?: string; slug: string; label_run?: string; episode_idx: number; quote_orig: string | null }[]) {
  const out: Record<string, typeof rows> = {}
  for (const r of rows) (out[r.slug] ??= []).push(r)
  return out
}
/** 원문을 문장으로 자른다(. ! ? 。 뒤 공백, 줄바꿈). */
export const sentences = (t: string) => norm(t).split(/(?<=[.!?。])\s+|\n+/).map((x) => x.trim()).filter(Boolean)
const NEG = /\b(not|no|never|without|hardly|barely|isn't|wasn't|didn't|don't|doesn't|won't|can't|couldn't)\s*$|n't\s*$/i
/**
 * [F3] 기본 strict: 인용이 원문 전체와 같거나, 원문의 연속된 **문장 단위**(1문장 이상)와 같아야 통과. 문장 중간에서 자른 발췌는 실패(not_sentence).
 * loose(참고용): 부분 문자열이면 통과시키되 절 중간 시작·끝, 원문 대비 40% 미만, 바로 앞에 부정어가 있으면 경고를 단다.
 * 인용 0건은 ok=false(no_quotes) — "확인할 게 없었다"를 통과로 접지 않는다(§7.1). 원문(source)은 결론서와 다른 경로(ss_episode_tags 원본)로 읽어야 독립 대조다.
 * source 의 에피소드에 source_key·label_run 이 있으면 인용의 것과도 맞아야 한다.
 */
export function verifyQuotes(
  payload: unknown,
  source: Record<string, (Pick<Episode, 'episode_idx' | 'quote_orig'> & { source_key?: string; label_run?: string })[]>,
  opts: { mode?: 'strict' | 'loose'; allowEmpty?: boolean } = {},
): QuoteCheck {
  const mode = opts.mode ?? 'strict'
  const quotes = collectQuotes(payload), mismatches: QuoteCheck['mismatches'] = [], warnings: QuoteCheck['warnings'] = []
  for (const q of quotes) {
    const key = quoteKey(q)
    const base = { slug: key, episode_idx: q.episode_idx, text: q.text }
    const eps = source[key]
    if (!eps) { mismatches.push({ ...base, reason: 'source_missing' }); continue }
    const e = eps.find((x) => x.episode_idx === q.episode_idx && (!q.label_run || !x.label_run || x.label_run === q.label_run) && (!q.source_key || !x.source_key || x.source_key === q.source_key))
    if (!e || !e.quote_orig) { mismatches.push({ ...base, reason: 'episode_missing' }); continue }
    const orig = norm(e.quote_orig), qt = norm(q.text)
    if (!qt || !orig.includes(qt)) { mismatches.push({ ...base, reason: 'text_differs' }); continue }
    if (qt === orig) continue
    const ss = sentences(e.quote_orig)
    const sentenceRun = ss.some((_, i) => ss.slice(i).some((__, j) => ss.slice(i, i + j + 1).join(' ') === qt))
    if (mode === 'strict' && !sentenceRun) { mismatches.push({ ...base, reason: 'not_sentence' }); continue }
    if (!sentenceRun) {
      const at = orig.indexOf(qt), before = orig.slice(0, at), after = orig.slice(at + qt.length)
      if ((before && !/[.!?,;:]\s*$/.test(before)) || (after && !/^\s*[.!?,;:]/.test(after))) warnings.push({ ...base, warn: 'mid_clause' })
      if (qt.length < orig.length * 0.4) warnings.push({ ...base, warn: 'short_excerpt' })
      if (NEG.test(before)) warnings.push({ ...base, warn: 'negation_nearby' })
    }
  }
  if (!quotes.length && !opts.allowEmpty) mismatches.push({ slug: '', episode_idx: -1, reason: 'no_quotes', text: '' })
  return { ok: mismatches.length === 0, checked: quotes.length, mismatches, warnings }
}
