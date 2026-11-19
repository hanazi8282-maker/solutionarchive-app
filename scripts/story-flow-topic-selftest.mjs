#!/usr/bin/env node
// [v71cu B1~B5 회귀] 진단 칸 채우기·주제 신호·권장 설정(stageFirst+topic)·비교 하니스 순수 함수·인용 검증. 모델·DB 불필요. consult-selftest 가 불러 CI 에서 돈다.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { selectStoryFlow, scoreCard, situationWithTopic, diagnosisFromReport, selectionToSimilar, verifyQuotes, STORY_FLOW_B_OPTS, W } from '../lib/consult/story-flow-select.ts'
import { situationMatch } from '../lib/consult/story-flow.ts'
import { enrichDiagnosis, priceBandFromText, topicConcepts, topicMatch, topicProfile } from '../lib/consult/story-flow-topic.ts'
import { pickCompanies, diagnosisFor, blindOrder, mulberry32, parseJudge, tally, JUDGE_SYSTEM } from './story-flow-compare.mjs'
import { UNTRUSTED_INPUT_NOTICE } from '../lib/llm/untrusted-input.ts'

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'))
const fx = read('../fixtures/story-flow/cards.json'), tf = read('../fixtures/story-flow/topic-cards.json')
const now = new Date('2026-11-20T00:00:00Z')
const slugs = (s) => [s.recommended, ...s.alternatives].map((p) => p.slug)

// ── 불변: 점수식 상수·기본 동작 ──
assert.deepEqual({ ...W }, { weight: 0.35, situation: 0.30, mechanism: 0.15, evidence: 0.15, recency: 0.05 }, '점수식 상수 불변')
assert.deepEqual({ ...STORY_FLOW_B_OPTS }, { stageFirst: true, topic: true })
const compose = readFileSync(new URL('../lib/consult/report/compose.ts', import.meta.url), 'utf8')
assert.ok(!/stageFirst|enrichDiagnosis|STORY_FLOW_B_OPTS|topic:/.test(compose), 'compose(결론서)는 B 옵션을 켜지 않는다 — 기본 동작 그대로')
const prof = topicProfile('소상공인 리뷰 관리')
for (const c of fx.cards) {
  const d = fx.diagnoses.area2_sales_assistant
  assert.equal(scoreCard(c, d, now), scoreCard(c, d, now, { topic: false }))
  assert.equal(scoreCard(c, { ...d, topic: prof }, now), scoreCard(c, d, now), '옵션 OFF 면 진단에 topic 이 있어도 점수 불변')
  assert.equal(situationWithTopic(c, { ...d, topic: { concepts: [], tokens: [] } }, true), situationMatch(c, d.situation), '주제 신호가 없으면 옵션 ON 이어도 기존 5칸 그대로')
}

// ── B1 진단 칸 채우기: 단서 있을 때만, 없으면 비움(지어내지 않음), 있는 칸은 덮지 않음 ──
const e1 = enrichDiagnosis({ chapter: 5, situation: { stage: 'zero_rev' } }, { oneLiner: '소상공인 가게의 리뷰 관리 SaaS, 월 9,900원 구독', url: 'https://www.reviewpal.co.kr' })
assert.deepEqual(e1.situation, { stage: 'zero_rev', customer: 'smb', pricing_model: 'subscription', price_band: '<10' })
assert.equal(e1.enrich_basis.customer, 'inferStructure:smb_owner')
const e0 = enrichDiagnosis({ chapter: 5, situation: {} }, { oneLiner: '좋은 앱을 만듭니다' })
assert.deepEqual(e0.situation, {}, '단서 없으면 칸을 채우지 않는다')
assert.deepEqual(enrichDiagnosis({ chapter: 6, situation: { customer: 'enterprise' } }, { oneLiner: '소상공인 대상' }).situation.customer, 'enterprise', '이미 있는 칸은 덮지 않는다')
assert.equal(enrichDiagnosis({ chapter: 6, situation: {} }, { oneLiner: '무료로 쓰다가 프리미엄 기능만 유료' }).situation.pricing_model, undefined, 'freemium 은 카드 어휘에 없어 비움')
assert.equal(enrichDiagnosis({ chapter: 6, situation: {} }, { oneLiner: '팀장용 보고 도구' }).situation.customer, undefined, 'team_lead 는 smb/enterprise 를 몰라 비움')
assert.equal(enrichDiagnosis({ chapter: 6, situation: {} }, { oneLiner: '중견기업 CS팀', segment: 'M' }).situation.price_band, '250+')
assert.equal(enrichDiagnosis({ chapter: 6, situation: {} }, { oneLiner: '중견기업 CS팀', segment: 'S' }).situation.price_band, undefined, 'S·P 세그먼트는 값대가 여러 칸에 걸쳐 비움')
assert.equal(enrichDiagnosis({ chapter: 6, situation: {} }, { oneLiner: '1인 창업자가 만든 견적 도구' }).situation.team_size, 'solo')
assert.ok(!('mechanism' in e1) || e1.mechanism === undefined, '원리는 채우지 않는다(어휘 불일치 — 0.5 유지)')
assert.equal(priceBandFromText('$29/mo'), '10-49'); assert.equal(priceBandFromText('월 $19 구독'), '10-49'); assert.equal(priceBandFromText('월 5만원'), '10-49')
assert.equal(priceBandFromText('월 9,900원'), '<10'); assert.equal(priceBandFromText('연 100만원'), undefined, '월 값이 아니면 쓰지 않는다'); assert.equal(priceBandFromText('$300/month'), '250+')

// ── B2 주제 신호: 한·영 다리, 낱말 경계, 모름 0.5 ──
assert.deepEqual(topicConcepts('seoul preview research capital industrial uploads'), [], '영어 낱말 경계(seo≠seoul, review≠preview, search≠research, api≠capital, trial≠industrial, ads≠uploads)')
assert.ok(topicConcepts('review_management').includes('review') && topicConcepts('리뷰를 모은다').includes('review'), '한·영 같은 개념')
assert.ok(topicConcepts('build_domain_authority_via_guest_posts').includes('seo'))
assert.ok(!topicConcepts('인사이트 리포트').includes('hr'), "2글자 '인사'가 '인사이트'에 걸리지 않음")
const [attr, give, agency, society, rpages] = tf.cards
const p5 = topicProfile('소상공인 가게 리뷰 관리 SaaS 검색 노출이 없다')
assert.equal(topicMatch(rpages, undefined), 0.5); assert.equal(topicMatch(rpages, { concepts: [], tokens: [] }), 0.5, '진단 신호 없음 = 모름 0.5')
assert.ok(topicMatch(rpages, p5) > topicMatch(attr, p5) && topicMatch(attr, p5) > topicMatch(give, p5), '리뷰+검색 > 검색 > 무관')
assert.ok(topicMatch(society, p5) < topicMatch(attr, p5))

// ── B3 실제 진단 경로(diagnosisFromReport: 장·단계만) + 권장 설정 → 합리적인 3건 ──
const loaders = { flowCards: async (ch) => tf.cards.filter((c) => c.chapter === ch) }
const real5 = diagnosisFromReport({ viability: { fit_broken_stage: 2, fit_color: '🔴' }, launched: true, revenue_band: '0', adversity: '손님이 안 온다' })
assert.deepEqual(real5.situation, { stage: 'zero_rev' })
const off = await selectStoryFlow(real5, loaders, { now })
assert.deepEqual(slugs(off), ['fxt-a-attributer', 'fxt-h-giveaway', 'fxt-m-agency'], '(재현) 기존 동작 = 동점 → slug 알파벳 순, 주제 맞는 카드는 밖')
assert.ok([off.recommended, ...off.alternatives].every((p) => p.score === off.recommended.score), '(재현) 세 건 점수 동점')
assert.deepEqual(slugs(await selectStoryFlow(real5, loaders, { now, stageFirst: true })), slugs(off), '(재현) stageFirst 만으로는 바뀌지 않는다')
const co5 = tf.compare_companies.find((c) => c.area_code === '5')
const en5 = enrichDiagnosis(real5, { oneLiner: co5.product_elevator_pitch, url: co5.competitor_url, detail: '손님이 안 온다 검색 노출이 없다' })
assert.equal(en5.situation.stage, 'zero_rev', '실진단 단계는 그대로')
const b5 = await selectStoryFlow(en5, loaders, { now, ...STORY_FLOW_B_OPTS })
assert.equal(b5.status, 'ok')
assert.equal(b5.recommended.slug, 'fxt-w-reviewpages', '권장 설정: 사업(리뷰 관리)·병목(검색 노출)이 맞는 카드가 추천')
assert.ok(slugs(b5).includes('fxt-a-attributer'), '검색 유입 사례가 3건 안')
assert.ok(!slugs(b5).includes('fxt-h-giveaway') && !slugs(b5).includes('fxt-s-society'), '주제 무관(소비재 기브어웨이·미용 예약금)은 밖')
assert.ok([b5.recommended, ...b5.alternatives].some((p) => p.failed), '안 된 시도 1건 유지(표시 붙음)')
assert.ok(selectionToSimilar(b5).some((x) => x.failed && x.what.startsWith('이 사례는 잘 안 풀린 경우입니다')))
assert.ok(b5.recommended.topic > 0.5 && typeof b5.recommended.topic === 'number', 'payload 에 주제 점수 기록(옵션 ON)')
assert.ok(!('topic' in off.recommended), '옵션 OFF 면 주제 칸 없음')
assert.ok(b5.recommended.reasons[0].includes('손님') && b5.recommended.reasons[0].includes('값대'), '이유가 "같은 장에서 비슷한 막힘" 대신 채운 칸을 말한다')
// 점수 동점이면 옵션 ON 일 때 주제 일치가 먼저(slug 알파벳보다 앞). 주제 칸만으로는 효과가 작다(상황 6칸 중 1칸 = 최대 0.05) — 동점 풀기·칸 채우기와 같이 써야 한다
const tieA = { ...attr, slug: 'aa-off-topic', episodes: [{ ...give.episodes[0], chapter: 5, result_class: 'positive', evidence_strength: 'A' }], domain: 'dtc_apparel' }
const tieZ = { ...attr, slug: 'zz-on-topic' }
const t3 = { ...attr, slug: 'mm-third', weight: 30 }
assert.equal(scoreCard(tieA, real5, now), scoreCard(tieZ, real5, now), '전제: 기본 점수 동점')
const tz = await selectStoryFlow({ ...real5, topic: p5 }, { flowCards: async () => [tieA, tieZ, t3] }, { now, topic: true })
assert.equal(tz.recommended.slug, 'zz-on-topic', '동점이면 주제가 맞는 쪽이 먼저')
assert.equal((await selectStoryFlow(real5, { flowCards: async () => [tieA, tieZ, t3] }, { now })).recommended.slug, 'aa-off-topic', 'OFF 면 기존 slug 순 그대로')
// 영역②(기존 픽스처 6장 카드): 실진단 + 칸 채우기 + 권장 설정 → 단계·손님·과금이 맞는 A 가 추천
const real2 = diagnosisFromReport(fx.real_inputs.area2_sales_assistant)
const sales = { flowCards: async (ch) => fx.cards.filter((c) => c.chapter === ch) }
const co2 = tf.compare_companies.find((c) => c.area_code === '2')
const b2 = await selectStoryFlow(enrichDiagnosis(real2, { oneLiner: co2.product_elevator_pitch, detail: fx.real_inputs.area2_sales_assistant.adversity }), sales, { now, ...STORY_FLOW_B_OPTS })
assert.equal(b2.recommended.slug, 'fx-sales-a')
// ── B5 인용 검증: 새 선택의 인용도 원본(카드 에피소드)과 strict 일치 ──
const src = Object.fromEntries(tf.cards.map((c) => [c.slug, c.episodes.map((e) => ({ ...e, source_key: c.source_key, label_run: c.label_run }))]))
const qc = verifyQuotes({ story_flow: b5 }, src)
assert.ok(qc.ok && qc.checked === 3, 'B 선택 인용 3/3 일치')
const bad = JSON.parse(JSON.stringify(b5)); bad.recommended.quote.text = bad.recommended.quote.text.replace('Google', 'Bing')
assert.ok(!verifyQuotes({ story_flow: bad }, src).ok, '한 낱말 바뀐 인용은 실패')

// ── B4 하니스 순수 함수 ──
const row = (id, area, pitch = `회사 ${id} 의 사업 설명은 이십 자를 넘습니다`) => ({ id, area_code: area, product_elevator_pitch: pitch, competitor_url: `https://${id}.test` })
const rows = [...'abcdefghij'.split('').map((x) => row(`2${x}`, '2')), ...'abcd'.split('').map((x) => row(`5${x}`, '5')), ...'ab'.split('').map((x) => row(`1${x}`, '1')), row('3a', '3'), row('4a', '4'), row('da', 'design'), row('ho', 'hold'), row('sh', '2', '짧다'), row('dup', '2', `회사 2a 의 사업 설명은 이십 자를 넘습니다`)]
const pk = pickCompanies(rows, 12)
assert.equal(pk.length, 12)
assert.ok(pk.filter((r) => r.area_code === '2').length >= 3 && pk.filter((r) => r.area_code === '5').length >= 3, '영역②·⑤ 각 3곳 이상')
assert.ok(!pk.some((r) => ['ho', 'sh', 'dup'].includes(r.id)), '영역 밖·짧은 설명·중복 설명 제외')
assert.deepEqual(pickCompanies(rows, 12).map((r) => r.id), pk.map((r) => r.id), '결정적')
assert.equal(diagnosisFor({ ...row('x', '5'), bottleneck: 'CONVERSION' }).d.chapter, 6)
assert.match(diagnosisFor(row('x', '5')).chapter_basis, /^default:5/)
const r1 = mulberry32(7), r2 = mulberry32(7), o1 = Array.from({ length: 20 }, () => blindOrder(r1).join()), o2 = Array.from({ length: 20 }, () => blindOrder(r2).join())
assert.deepEqual(o1, o2, '같은 시드 = 같은 순서'); assert.ok(new Set(o1).size === 2, '두 순서가 모두 나온다(블라인드)')
assert.equal(parseJudge({ x: 6, y: 3 }), null); assert.equal(parseJudge({ x: 2.5, y: 3 }), null); assert.deepEqual(parseJudge({ x: 2, y: 5 }).y, 5)
const tl = tally([{ score: { legacy: 2, b: 4 } }, { score: { legacy: 3, b: 3 } }, { score: { legacy: 5, b: 1 } }, { score: null }])
assert.deepEqual(tl, { judged: 3, total: 4, mean_legacy: 3.33, mean_b: 2.67, win: 1, tie: 1, loss: 1 }, '채점 실패는 평균·승패에서 뺀다')
assert.ok(JUDGE_SYSTEM.includes(UNTRUSTED_INPUT_NOTICE))
const harness = readFileSync(new URL('./story-flow-compare.mjs', import.meta.url), 'utf8')
assert.ok(harness.includes("import('../lib/story-label/cli.mjs')") && !/ANTHROPIC_API_KEY\s*[:=]/.test(harness), '구독 경로 runCli 재사용')
assert.ok(!/\.(insert|update|upsert|delete)\(/.test(harness), '하니스는 DB 에 쓰지 않는다')
// ── B 후속: 화면 문장 잘림(문장·낱말 중간 금지, 숫자·$ 토큰 보호) ──
const { clipText, summaryText, displayName } = await import('../lib/consult/story-flow-select.ts')
const numLong = '9개월간 이메일 리드 100명을 모았다. 그 뒤 MRR 약 $1.2k 를 넘겼고 신규 유료 고객이 월 40% 늘었다. 광고는 쓰지 않았다. ' + '커뮤니티 답변을 매일 세 개씩 달았다. '.repeat(8)
const c1 = clipText(numLong, 110)
assert.ok(c1.length <= 110 && /[다.]$/.test(c1) && !c1.endsWith('…'), `완결 문장까지만: ${c1}`)
assert.ok(c1.includes('$1.2k') && !/\$1$|\$1\.$|총 $|신규 유$/.test(c1), '$·소수점 토큰이 쪼개지지 않음')
for (const m of [12, 25, 37, 45]) { const c = clipText('MRR 약 $1.2k 를 넘겼고 신규 유료 고객이 늘었고 광고는 쓰지 않았고 커뮤니티에 답을 달았고', m); assert.ok(c.endsWith('…') && c.length <= m, c); assert.ok(!/\$1(\.\d?)?…$|\$…$/.test(c), `토큰 보호: ${c}`); const body = c.slice(0, -1); assert.ok('MRR 약 $1.2k 를 넘겼고 신규 유료 고객이 늘었고 광고는 쓰지 않았고 커뮤니티에 답을 달았고'.split(' ').reduce((acc, w) => (acc.done || (acc.s ? acc.s + ' ' + w : w).length > body.length ? { ...acc, done: true } : { s: acc.s ? acc.s + ' ' + w : w, done: false }), { s: '', done: false }).s === body, `낱말 경계: ${c}`) }
const koLong = '처음에는 지인에게만 알렸고 반응이 거의 없어서 동네 가게 사장님들을 한 분씩 찾아가 직접 설명하고 써 보게 했으며 그 과정에서 받은 불만을 모아 기능을 고쳤고 결국 입소문으로 가입이 늘어나기 시작했던 것이 가장 큰 전환점이었다고 회고했다'
const c2 = clipText(koLong, 80)
assert.ok(c2.endsWith('…') && c2.length <= 80 && koLong.startsWith(c2.slice(0, -1)) && koLong.charAt(c2.length - 1) === ' ', `한국어 긴 문장 → 낱말 경계: ${c2}`)
const noDot = 'cold outreach to agencies with a personalised loom video for every single prospect over six months without any paid ads'
const c3 = clipText(noDot, 50)
assert.ok(c3.endsWith('…') && noDot.startsWith(c3.slice(0, -1)) && noDot.charAt(c3.length - 1) === ' ', `마침표 없는 긴 문장: ${c3}`)
assert.equal(clipText('짧은 문장이다.', 110), '짧은 문장이다.', '한도 안이면 그대로')
const sm = summaryText('콜드메일을 매주 50통 보냈다.', numLong)
assert.ok(sm.startsWith('콜드메일을 매주 50통 보냈다. → ') && sm.length <= 220 && !/총 $|\$1$/.test(sm), `요약: 행동 전부 + 결과는 경계에서: ${sm}`)
assert.equal(summaryText('가격표를 공개했다', '전환 2배'), '가격표를 공개했다 → 전환 2배', '짧으면 구분자 유지')
assert.ok(summaryText('가'.repeat(250), '결과').length <= 220)
const dn = displayName('how-we-doubled-our-product-line-and-grew-subscribers-to-180k-in-eighteen-months', 1)
assert.ok(dn.length <= 60 && dn.endsWith('…') && 'How We Doubled Our Product Line And Grew Subscribers To 180k In Eighteen Months'.startsWith(dn.slice(0, -1)), `이름 낱말 경계: ${dn}`)
const longWhy = { status: 'ok', recommended: { name: 'x', failed: false, fail_kind: null, summary_ko: 's', reasons: ['손님·값대·단계·팀 크기가 같다, 같은 원리(reduce_purchase_doubt_by_transparency)를 쓴다', '숫자로 확인된 결과, 증거 등급 A, 이유가 사슬로 적혀 있다, 안 된 시도도 함께 담겨 있다, 통하는 조건이 적혀 있다'] }, alternatives: [] }
const wy = selectionToSimilar(longWhy)[0].why, full = `${longWhy.recommended.reasons[0]} / ${longWhy.recommended.reasons[1]}`
assert.ok(wy.length <= 120 && wy.endsWith('…') && full.startsWith(wy.slice(0, -1)) && full.charAt(wy.length - 1) === ' ' || full.startsWith(wy.slice(0, -1).trimEnd()), `why 낱말 경계: ${wy}`)
console.log('story-flow-topic-selftest: 통과')
