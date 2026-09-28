#!/usr/bin/env node
// VOC 가중치·묶음 프로토타입 — 설계 문서 reports/2026-09-28/voc-weighting-design.md 의 산식을 그대로 옮긴 순수 함수.
// **어디에도 배선돼 있지 않다.** voc-export.mjs 가 이 산식을 채택하면 그쪽으로 옮기고 이 파일은 지운다.
//
//   node scripts/voc-weighting-proto.mjs            # 설계 문서 §1 의 예시 6건 + 묶음 예시를 실제 계산해 찍는다
//   node scripts/voc-weighting-proto.mjs --selftest # 산식이 문서와 어긋나면 실패
//
// 재사용: painHits(extract-select.ts) · toTerms(advisor.ts). 여기서 낱말 사전을 새로 만들지 않는다.

import { painHits } from '../lib/analysis/extract-select.ts'
import { toTerms } from '../lib/cases/advisor.ts'

// ── 1. 풍부함(richness) — 원문만 보고 결정적으로 뽑는다 ─────────────────────
/** 수치+단위·금액·기간. "300%"·"$49/월"·"2주"·"3만원". 단위 없는 맨 숫자는 세지 않는다(advisor.ts 와 같은 이유). */
const NUM_RE = /(?:[$€£₩]\s?\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s?(?:%|원|만원|천원|달러|불|usd|krw|배|개월|개|주|일|시간|분|년|명|건|회|kg|g|ml|l|gb|mb|mah|x))(?![a-z가-힣])/gi
/** 비교·전환 표현. "보다"·"대신"·"vs"·"switched from"·"갈아탔". */
const CMP_RE = /(?:보다|대신|대비|비해|갈아탔|갈아탈|옮겼|바꿨|넘어갔|전환했|\bvs\.?\b|\bthan\b|instead of|compared to|switch(?:ed|ing)? (?:from|to)|moved? (?:from|to)|migrat(?:ed|ing)? (?:from|to)|alternative)/i
/** 구체 상황 동사 — "써보니·했더니·해지했·환불" 류. 경험이 있었다는 표지. */
const VERB_RE = /(?:써보니|써봤|썼는데|쓰다가|쓰고 있|사용해보|해봤|했더니|했는데|해지|환불|취소했|고장|안 ?됨|안 ?돼|안 ?되|I(?:'ve)? (?:tried|used|cancel+ed|switched|paid|been using)|after \d|when I|stopped using|refund)/i
/** 브랜드꼴 낱말 — CamelCase·대문자 시작 라틴 4자+ (문장 첫 낱말 제외). 자기 브랜드는 호출부가 뺀다. "Pay"·"App" 같은 3자는 오탐이 많아 뺀다. */
const BRAND_RE = /(?<=[^.!?\n]\s)(?:[A-Z][a-z0-9]+(?:[A-Z][a-z0-9]+)+|[A-Z][a-zA-Z0-9]{3,})/g
const BRAND_STOP = new Set(['The', 'This', 'That', 'And', 'But', 'For', 'With', 'From', 'Not', 'Also', 'Just', 'Very', 'Really'])

/** 길이 밴드 — extract-select 와 같은 발상(밴드 밖 ×0.5). 밴드는 VOC 실측 중앙값(≈110자)에 맞춰 40~1500. */
export const LENGTH_MIN = 40
export const LENGTH_MAX = 1500
export const OUT_OF_BAND = 0.5
const FEATURE_CAP = 3  // 특징 하나가 점수를 독식하지 않게(숫자 20개 나열 = 3)

const count = (s, re) => (s.match(re) ?? []).length

/** 특징 벡터. 각 항목은 0..3. */
export function richnessFeatures(text, { ownBrand = '' } = {}) {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim()
  const own = ownBrand.toLowerCase()
  const brands = (t.match(BRAND_RE) ?? []).filter((b) => !BRAND_STOP.has(b) && (!own || !b.toLowerCase().includes(own)))
  return {
    num: Math.min(FEATURE_CAP, count(t, NUM_RE)),
    alt: Math.min(FEATURE_CAP, new Set(brands.map((b) => b.toLowerCase())).size),
    cmp: CMP_RE.test(t) ? 1 : 0,
    scn: Math.min(FEATURE_CAP, painHits(t) + (VERB_RE.test(t) ? 1 : 0)),
    len: t.length,
  }
}

/** richness = (1 + num + alt + cmp + scn) × 길이밴드. 최소 0.5, 최대 11. */
export function richness(text, opts) {
  const f = richnessFeatures(text, opts)
  const band = f.len >= LENGTH_MIN && f.len <= LENGTH_MAX ? 1 : OUT_OF_BAND
  return { ...f, score: (1 + f.num + f.alt + f.cmp + f.scn) * band }
}

// ── 2. 라벨 — 믿을 수 있는 것만 ────────────────────────────────────────────
export const WTP_BONUS = 0.5
/** item_score = richness × (1 + 0.5·[wtp=true]). NULL·false 는 둘 다 가산 0 — 감점이 아니다(§7.1). impact·frequency 는 쓰지 않는다. */
export function itemScore(text, labels = {}, opts) {
  const r = richness(text, opts)
  return { ...r, item_score: r.score * (1 + (labels.wtp_mentioned === true ? WTP_BONUS : 0)) }
}

// ── 3. 수요 빈도 — 같은 말을 몇 명이 하나 ──────────────────────────────────
export const JACCARD_MIN = 0.5
export const CLUSTER_MIN_TOKENS = 2
/** 묶음 가산 = 3·log2(n). n=2→3, 4→6, 10→9.97. 한 줄짜리 10건이 최상위 풍부 항목(≈8~11)과 같은 자리에 선다. */
export const clusterBoost = (n) => (n >= 2 ? 3 * Math.log2(n) : 0)

const jaccard = (a, b) => {
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / (a.size + b.size - inter)
}

/**
 * 탐욕 단일 패스 묶기. 입력 순서(input_id 정렬)대로 첫 번째로 겹치는 묶음에 붙인다 — 결정적.
 * 토큰 1개 이하는 절대 묶지 않는다("페이" 한 낱말이 "페이 되나요"·"애플페이 지원" 을 전부 삼킨다).
 * ponytail: O(n²) 이고 시드(첫 멤버)하고만 비교한다. 프로젝트당 수백 건이면 충분하다.
 *   부족해지면 (1) 멤버 합집합과 비교, (2) 임계 조정, (3) 그래도 안 되면 설계 §4 의 3차 판정 트리거.
 */
export function clusterItems(items) {
  const clusters = []
  const seeds = []
  for (const it of items) {
    const toks = new Set(toTerms(it.text))
    if (toks.size < CLUSTER_MIN_TOKENS) { it.cluster = null; continue }
    let hit = -1
    for (let i = 0; i < seeds.length; i++) if (jaccard(toks, seeds[i]) >= JACCARD_MIN) { hit = i; break }
    if (hit === -1) { seeds.push(toks); clusters.push([]); hit = clusters.length - 1 }
    clusters[hit].push(it)
    it.cluster = hit
  }
  return clusters
    .map((members, i) => {
      const rep = members.reduce((a, b) => (b.item_score > a.item_score ? b : a))
      const signals = members.map((m) => m.labels?.community_signal).filter(Boolean)
      const top = [...new Set(signals)].sort((a, b) => signals.filter((s) => s === b).length - signals.filter((s) => s === a).length)[0] ?? null
      return { id: i, n: members.length, key: [...seeds[i]].sort().slice(0, 6), representative: rep, members, signal: top, cluster_score: rep.item_score + clusterBoost(members.length) }
    })
    .filter((c) => c.n >= 2)
}

// ── 4. 정렬·상한 — 풀에서 아무것도 버리지 않는다 ───────────────────────────
/**
 * 반환: { ranked, clusters, folded }. ranked = 상한 안에 실리는 항목(묶음은 대표 1건만 자리를 쓴다).
 * folded = 묶음에 접혀 목록에는 없지만 count 에 들어간 건수. 상한 밖 항목도 묶음 count 에는 들어간다.
 */
export function rankPool(items, { cap = 30, ownBrand = '' } = {}) {
  const scored = items.map((it) => ({ ...it, ...itemScore(it.text, it.labels, { ownBrand }) }))
    .sort((a, b) => String(a.input_id).localeCompare(String(b.input_id)))  // 묶기 전 결정적 순서
  const clusters = clusterItems(scored)
  const repOf = new Map(clusters.map((c) => [c.representative, c]))
  const inCluster = new Set(clusters.flatMap((c) => c.members))
  const slots = scored
    .filter((it) => !inCluster.has(it) || repOf.has(it))
    .map((it) => ({ ...it, rank_score: repOf.get(it)?.cluster_score ?? it.item_score, cluster_n: repOf.get(it)?.n ?? 1 }))
    .sort((a, b) => b.rank_score - a.rank_score || String(b.collected_at ?? '').localeCompare(String(a.collected_at ?? '')) || String(a.input_id).localeCompare(String(b.input_id)))
  return { ranked: slots.slice(0, cap), clusters, folded: scored.length - slots.length, beyond_cap: Math.max(0, slots.length - cap) }
}

// ── 예시·셀프테스트 ─────────────────────────────────────────────────────────
const EXAMPLES = [
  { id: 'E1', labels: { wtp_mentioned: true, community_signal: 'demand' }, text: 'I use ConvertKit for the newsletter at $49/mo. Its pricing is far more reasonable than MailChimp, and the sequenced autoresponders boosted my open rate about 30% after 2 weeks.' },
  { id: 'E2', labels: { wtp_mentioned: null, community_signal: 'pain' }, text: '3개월 써보니 펌프가 두 번이나 고장났어요. 용기 뚜껑도 헐거워서 가방에서 새고, 가격 대비 이 정도면 다른 브랜드로 갈아탈 생각입니다.' },
  { id: 'E3', labels: { wtp_mentioned: null, community_signal: null }, text: '탈모가 꼭 완화되길요.. 탈모가 꼭 완화되길요..' },
  { id: 'E4', labels: { wtp_mentioned: false, community_signal: 'demand' }, text: 'Apple Pay 되나요?' },
  { id: 'E5', labels: { wtp_mentioned: null, community_signal: 'pain' }, text: '가격이 좀 비싸지만 효과는 정말 있어서 좋아요' },
  { id: 'E6', labels: { wtp_mentioned: null, community_signal: 'objection' }, text: 'Switched from Baremetrics to ChartMogul last month — the $129/mo tier was too much for 40 customers, and the Stripe sync kept lagging by a day.' },
]
const APPLE_PAY = ['Apple Pay 되나요?', 'apple pay 지원 되나요', 'Apple Pay 결제 되나요?', '애플페이 되나요', 'Apple pay 되나요?', 'apple pay 되나요??', 'Apple Pay 결제 지원되나요', 'apple pay?', 'Apple Pay 지원하나요', 'Apple Pay 되나요 ㅠ']

function pool() {
  const items = EXAMPLES.map((e, i) => ({ input_id: `e${i}`, text: e.text, labels: e.labels, collected_at: `2026-09-2${i}` }))
  APPLE_PAY.forEach((t, i) => items.push({ input_id: `ap${String(i).padStart(2, '0')}`, text: t, labels: { community_signal: 'demand' }, collected_at: '2026-09-10' }))
  return items
}

if (process.argv.includes('--selftest')) {
  const fails = []
  const t = (name, ok) => { if (!ok) fails.push(name) }
  const s = Object.fromEntries(EXAMPLES.map((e) => [e.id, itemScore(e.text, e.labels)]))
  t('E1 풍부(수치·경쟁사·비교·wtp) 가 최상위', s.E1.item_score > s.E2.item_score && s.E2.item_score > s.E5.item_score)
  t('E3 빈 바람 = 밴드 안이어도 특징 0 → 1.0', s.E3.item_score === 1 || s.E3.item_score === 0.5)
  t('E4 한 줄 질문 = 0.5 (버리지 않는다, 낮을 뿐)', s.E4.item_score === 0.5)
  t('wtp=true 만 가산, false·null 은 같다', itemScore('x'.repeat(50), { wtp_mentioned: false }).item_score === itemScore('x'.repeat(50), { wtp_mentioned: null }).item_score)
  t('impact 는 점수에 없다', itemScore('x'.repeat(50), { impact: 'high' }).item_score === itemScore('x'.repeat(50), { impact: null }).item_score)
  const r = rankPool(pool(), { cap: 30 })
  const ap = r.clusters.find((c) => c.key.includes('apple'))
  t('Apple Pay 변형이 한 묶음으로 묶인다(영문 8건 이상)', ap && ap.n >= 8)
  t('한글 "애플페이" 는 못 묶는다 — 알려진 한계', !ap.members.some((m) => m.text.includes('애플페이')))
  t('묶음 대표가 상위 3 안에 든다', r.ranked.slice(0, 3).some((x) => x.cluster_n >= 8))
  t('묶음 멤버는 자리를 하나만 쓴다 (묶이지 못한 변형 2건은 따로 선다 — 한계)', r.ranked.filter((x) => x.cluster_n === ap.n).length === 1 && r.ranked.filter((x) => /apple|애플/i.test(x.text)).length === 3)
  t('접힌 건수 = 묶음 n - 1 합', r.folded === r.clusters.reduce((n, c) => n + c.n - 1, 0))
  t('상한 밖 항목도 묶음 count 에 들어간다', rankPool(pool(), { cap: 2 }).clusters.find((c) => c.key.includes('apple')).n === ap.n)
  t('토큰 1개짜리는 묶이지 않는다', rankPool([{ input_id: 'a', text: '페이' }, { input_id: 'b', text: '페이' }]).clusters.length === 0)
  t('결정적 — 입력 순서를 바꿔도 같은 결과', JSON.stringify(rankPool(pool().reverse()).ranked.map((x) => x.input_id)) === JSON.stringify(r.ranked.map((x) => x.input_id)))
  if (fails.length) { console.error('실패:', fails); process.exit(1) }
  console.log(`✓ voc-weighting-proto 셀프테스트 통과 (${13 - fails.length}/13)`)
} else {
  console.log('## 항목 점수')
  for (const e of EXAMPLES) {
    const s = itemScore(e.text, e.labels)
    console.log(`${e.id} len=${s.len} num=${s.num} alt=${s.alt} cmp=${s.cmp} scn=${s.scn} richness=${s.score} wtp=${e.labels.wtp_mentioned} → item_score=${s.item_score.toFixed(2)}`)
  }
  const r = rankPool(pool())
  console.log('\n## 묶음')
  for (const c of r.clusters) console.log(`n=${c.n} key=[${c.key.join(' ')}] signal=${c.signal} rep="${c.representative.text}" cluster_score=${c.cluster_score.toFixed(2)}`)
  console.log(`\n## 순위 (folded=${r.folded}, beyond_cap=${r.beyond_cap})`)
  r.ranked.forEach((x, i) => console.log(`${i + 1}. ${x.rank_score.toFixed(2)}${x.cluster_n > 1 ? ` ×${x.cluster_n}` : ''}  ${x.text.slice(0, 60)}`))
}
