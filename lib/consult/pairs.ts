// [v71cu 쌍 찾기] outcome_pairs_matched 의 점수·순위 규칙을 그대로 옮긴 순수 함수(모델·DB 없음).
// SQL 정본: supabase/migrations/20261120000010_outcome_pairs_matched.sql — 가중치·동점 규칙을 바꾸면 두 곳을 같이 바꾼다
// (scripts/pair-finder-selftest.mjs 가 마이그 본문의 가중치와 이 표를 대조한다).
// PAIR_FINDER_ENABLED 를 읽지 않는다. 깃발 배선은 이 파일의 일이 아니다.
import { createHash } from 'node:crypto'

export const PAIR_WEIGHTS = { sub_topic: 3, domain: 2, customer: 1, stage: 1, price_band: 1, team_size: 1, pricing_model: 1 } as const
type Field = keyof typeof PAIR_WEIGHTS
const FIELDS = Object.keys(PAIR_WEIGHTS) as Field[]
const FREE: ReadonlySet<Field> = new Set<Field>(['sub_topic', 'domain', 'pricing_model']) // 자유 문장 칸: 소문자·앞뒤 공백 정리 후 비교
const DIFF_CLOSED = ['stage', 'team_size', 'customer', 'price_band'] as const
const DIFF_TEXT = ['condition_ko', 'adversity_ko'] as const

/** 에피소드 + 그 글의 상황 칸(ss_episode_tags_current ⋈ ss_story_labels_current 한 행). */
export type PairEpisode = {
  source_key: string; slug: string; episode_idx: number
  chapter: number; mechanism_norm: string | null
  result_class: string; result_grain?: string | null
  evidence_strength?: string | null; text_depth?: string | null
  condition_ko?: string | null; adversity_ko?: string | null
} & Partial<Record<Field, string | null>>

export type MatchedPair = {
  chapter: number; mechanism_norm: string
  lose_source: string; lose_slug: string; lose_ep: number; lose_class: string
  win_source: string; win_slug: string; win_ep: number
  rank: number; score: number
  cross_domain: boolean | null; lose_depth: string | null
  diff_candidates: Record<string, [string | null, string | null]>
}

/** 빈 값·unknown → null. SQL 의 NULLIF(NULLIF(btrim(lower(x)),''),'unknown') 과 같다. */
export function normField(field: Field, v: string | null | undefined): string | null {
  if (v == null) return null
  const s = FREE.has(field) ? v.trim().toLowerCase() : v
  return s === '' || s === 'unknown' ? null : s
}

/** 비슷함 점수 0~10. 모름은 일치로 치지 않는다(감점일 뿐 탈락 아님). */
export function pairScore(lose: PairEpisode, win: PairEpisode): number {
  let s = 0
  for (const f of FIELDS) { const a = normField(f, lose[f]); if (a !== null && a === normField(f, win[f])) s += PAIR_WEIGHTS[f] }
  return s
}

/** {칸: [된 쪽, 안 된 쪽]}. 닫힌 칸은 둘 다 알고 다를 때만, 문장 칸은 다르면(한쪽이 비어도) 싣는다. */
export function diffCandidates(win: PairEpisode, lose: PairEpisode): MatchedPair['diff_candidates'] {
  const out: MatchedPair['diff_candidates'] = {}
  for (const f of DIFF_CLOSED) { const w = normField(f, win[f]), l = normField(f, lose[f]); if (w !== null && l !== null && w !== l) out[f] = [w, l] }
  for (const f of DIFF_TEXT) { const w = win[f] ?? null, l = lose[f] ?? null; if (w !== l) out[f] = [w, l] }
  return out
}

const cmp = (a: string | number, b: string | number) => (a < b ? -1 : a > b ? 1 : 0)
const md5 = (s: string) => createHash('md5').update(s).digest('hex')
const story = (e: { source_key: string; slug: string }) => `${e.source_key}\u0000${e.slug}`

/** refresh_outcome_pairs_matched(k, min_score) 의 미러. 입력 순서와 무관하게 같은 결과를 낸다. */
export function matchPairs(episodes: PairEpisode[], k = 3, minScore = 2): MatchedPair[] {
  const usable = episodes.filter((e) => e.mechanism_norm != null && e.mechanism_norm !== '기타')
  const wins = new Map<string, PairEpisode[]>()
  for (const e of usable) {
    if (e.result_class !== 'positive' || e.result_grain === 'signal') continue
    const key = `${e.chapter}\u0000${e.mechanism_norm}`
    wins.set(key, [...(wins.get(key) ?? []), e])
  }
  const out: MatchedPair[] = []
  for (const l of usable) {
    if (l.result_class !== 'negative' && l.result_class !== 'mixed') continue
    const best = new Map<string, { w: PairEpisode; score: number }>() // 된 쪽 글 하나당 1개
    for (const w of wins.get(`${l.chapter}\u0000${l.mechanism_norm}`) ?? []) {
      if (story(w) === story(l)) continue
      const score = pairScore(l, w)
      if (score < minScore) continue
      const cur = best.get(story(w))
      const better = !cur || score > cur.score || (cur.score === score && (cmp(w.evidence_strength ?? 'C', cur.w.evidence_strength ?? 'C') || cmp(w.episode_idx, cur.w.episode_idx)) < 0)
      if (better) best.set(story(w), { w, score })
    }
    const ranked = [...best.values()].sort((a, b) =>
      cmp(b.score, a.score) || cmp(a.w.evidence_strength ?? 'C', b.w.evidence_strength ?? 'C')
      || cmp(md5(`${l.slug}|${a.w.slug}`), md5(`${l.slug}|${b.w.slug}`)) || cmp(a.w.source_key, b.w.source_key) || cmp(a.w.slug, b.w.slug))
    ranked.slice(0, k).forEach(({ w, score }, i) => {
      const ld = normField('domain', l.domain), wd = normField('domain', w.domain)
      out.push({
        chapter: l.chapter, mechanism_norm: l.mechanism_norm as string,
        lose_source: l.source_key, lose_slug: l.slug, lose_ep: l.episode_idx, lose_class: l.result_class,
        win_source: w.source_key, win_slug: w.slug, win_ep: w.episode_idx,
        rank: i + 1, score, cross_domain: ld === null || wd === null ? null : ld !== wd,
        lose_depth: l.text_depth ?? null, diff_candidates: diffCandidates(w, l),
      })
    })
  }
  return out
}

type PairRow = Pick<MatchedPair, 'chapter' | 'mechanism_norm' | 'lose_source' | 'lose_slug' | 'lose_ep' | 'lose_class' | 'win_source' | 'win_slug' | 'rank' | 'score'> & { diff_candidates?: Record<string, unknown> | null }

/** 표 행 → 보고용 집계. "쌍 3개 이상"은 쌍 수가 아니라 서로 다른 안 된 글 ≥3 ∧ 서로 다른 된 글 ≥2 로 센다(설계 §3-4). */
export function summarizePairs(rows: PairRow[], maxRank = 3) {
  const used = rows.filter((r) => r.rank <= maxRank)
  const byChapter: Record<string, { pairs: number; anchors: number; negative: number; mixed: number }> = {}
  const scoreDist: Record<string, number> = {}
  const anchors = new Set<string>()
  const cells = new Map<string, { pairs: number; lose: Set<string>; win: Map<string, number>; diffs: Map<string, { lose: Set<string>; win: Set<string> }> }>()
  for (const r of used) {
    const ch = (byChapter[r.chapter] ??= { pairs: 0, anchors: 0, negative: 0, mixed: 0 })
    ch.pairs++
    if (r.lose_class === 'negative') ch.negative++; else ch.mixed++
    const a = `${r.lose_source}\u0000${r.lose_slug}\u0000${r.lose_ep}`
    if (!anchors.has(a)) { anchors.add(a); ch.anchors++ }
    scoreDist[r.score] = (scoreDist[r.score] ?? 0) + 1
    const key = `${r.chapter}|${r.mechanism_norm}`
    const c = cells.get(key) ?? { pairs: 0, lose: new Set<string>(), win: new Map<string, number>(), diffs: new Map() }
    cells.set(key, c)
    const ls = `${r.lose_source}\u0000${r.lose_slug}`, ws = `${r.win_source}\u0000${r.win_slug}`
    c.pairs++; c.lose.add(ls); c.win.set(ws, (c.win.get(ws) ?? 0) + 1)
    for (const f of DIFF_CLOSED) {
      const d = r.diff_candidates?.[f]
      if (!Array.isArray(d)) continue
      const dk = `${f}: ${d[0]} → ${d[1]}`
      const e = c.diffs.get(dk) ?? { lose: new Set<string>(), win: new Set<string>() }
      c.diffs.set(dk, e); e.lose.add(ls); e.win.add(ws)
    }
  }
  const pass = (lose: number, win: number) => lose >= 3 && win >= 2
  const passingCells: string[] = []
  const repeatedDiffs: { cell: string; diff: string; lose_stories: number; win_stories: number }[] = []
  let winReuseMax: { cell: string; win: string; pairs: number; share: number } | null = null
  for (const [key, c] of cells) {
    if (pass(c.lose.size, c.win.size)) passingCells.push(key)
    for (const [dk, e] of c.diffs) if (pass(e.lose.size, e.win.size)) repeatedDiffs.push({ cell: key, diff: dk, lose_stories: e.lose.size, win_stories: e.win.size })
    for (const [ws, n] of c.win) {
      // 된 쪽 글 하나가 한 칸 쌍의 20% 를 넘으면 재사용 상한을 검토한다(설계 §3-6). 쌍 10개 미만 칸은 비율이 의미 없어 뺀다.
      if (c.pairs >= 10 && (!winReuseMax || n / c.pairs > winReuseMax.share)) winReuseMax = { cell: key, win: ws.replace('\u0000', '/'), pairs: n, share: Number((n / c.pairs).toFixed(3)) }
    }
  }
  return {
    max_rank: maxRank, pairs: used.length, anchors: anchors.size, by_chapter: byChapter, score_dist: scoreDist,
    cells: cells.size, passing_cells: passingCells.length, passing_cell_keys: passingCells.sort(),
    repeated_diffs: repeatedDiffs.sort((a, b) => b.lose_stories - a.lose_stories || cmp(a.cell + a.diff, b.cell + b.diff)),
    win_reuse_max: winReuseMax,
  }
}
