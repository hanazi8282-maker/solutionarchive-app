#!/usr/bin/env node
// [v71cu E1·E2 회귀] 평가 파이프라인 — 패킷 렌더링·블라인드(경로 정체 비노출)·대조군·합격 계산 경계값·무효 판정·일치도·CLI 끝까지. 모델·DB 불필요(합성 입력 + 픽스처 카드). consult-selftest 가 불러 CI 에서 돈다.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildPack, conditionFor, parseVariants, validateDiagnoses, formSchema, packetMarkdown, renderPanel, GENERIC_ADVICE, SCORE_ITEMS as PACK_ITEMS } from './story-flow-eval-pack.mjs'
import { evaluate, parseResponse, pearson, PASS, GOOD_CONTROL_MIN, SCORE_ITEMS } from './story-flow-eval-score.mjs'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))
const fxCards = (p) => JSON.parse(readFileSync(here(p), 'utf8')).cards
const cards = [...fxCards('../fixtures/story-flow/cards.json'), ...fxCards('../fixtures/story-flow/topic-cards.json')]
const loaders = { flowCards: async (ch) => cards.filter((c) => c.chapter === ch && c.weight >= 30) }
const now = new Date('2026-11-20T00:00:00Z')
const legacyCalls = []
const legacy = async (i) => { legacyCalls.push(i); return [{ name: 'Acme Legacy Corp', what: '리뷰 답글을 자동으로 달았다 → 별점이 올랐다', why: '같은 리뷰 관리 도구다' }] }

// 합성 진단 — 실제 회사 아님
const DX = [
  { id: 'syn-5', area: '5', has_pitch: true, name: '합성 리뷰가게', pitch: '소상공인 가게의 네이버·구글 리뷰 관리와 답글 작성을 돕는 SaaS, 월 9,900원 구독', url: 'https://www.example-reviewpal.test', business_model: '월 구독',
    bottleneck: 'AWARENESS', situation: { stage: 'zero_rev', customer: 'smb' }, adversity_text: '검색 노출이 없어 손님이 안 온다', customer_story: '출시 석 달째인데 가입이 거의 없다.' },
  { id: 'syn-2', area: '2', has_pitch: false, name: '합성 영업도우미', pitch: '1인 창업자가 만든 소상공인용 영업 도우미, 무료 체험 후 월 $19 구독', url: 'https://example-salesmate.test',
    bottleneck: '써 보고 돈은 안 낸다', situation: { stage: 'early_rev', customer: 'smb', price_band: '10-49' }, adversity_text: '무료 체험 뒤 유료 전환이 안 된다', customer_story: '체험은 하는데 결제를 안 한다.' },
]

// ── 입력 검사·조건 ──
assert.deepEqual(parseVariants('both'), ['base', 'topic']); assert.deepEqual(parseVariants(), ['topic']); assert.deepEqual(parseVariants('topic,base'), ['base', 'topic'])
assert.throws(() => parseVariants('legacy')); assert.throws(() => parseVariants(''))
assert.deepEqual(validateDiagnoses(DX), [])
const verr = validateDiagnoses([{ ...DX[0], area: '9' }, { ...DX[0], bottleneck: '모름' }, { ...DX[1], id: 'syn-2' }, { ...DX[1], has_pitch: true, pitch: '' }])
assert.ok(verr.some((e) => /area/.test(e)) && verr.some((e) => /bottleneck/.test(e)) && verr.some((e) => /중복/.test(e)) && verr.some((e) => /pitch/.test(e)), '입력 오류를 모두 잡는다')
assert.deepEqual(validateDiagnoses([]), ['진단 입력이 비었거나 배열이 아님'])
const c2 = conditionFor(DX[1])
assert.deepEqual(c2.base.situation, { stage: 'early_rev' }, 'has_pitch=false = 실제 경로: 상황은 단계만')
assert.equal(c2.enrich.oneLiner, ''); assert.equal(c2.legacy.oneLiner, '', 'has_pitch=false 면 두 경로 모두 사업 설명을 비운다')
assert.deepEqual(c2.base.chapters, [6], '결론서 질문 답 → 장')
const c5 = conditionFor(DX[0])
assert.deepEqual(c5.base.situation, { stage: 'zero_rev', customer: 'smb' }); assert.ok(c5.enrich.oneLiner.includes('리뷰 관리') && c5.enrich.oneLiner.includes('월 구독'))
assert.equal(c5.legacy.category, '리뷰 관리·글쓰기'); assert.deepEqual(c5.base.chapters, [5], 'analysis_projects 코드 → 장')

// ── 패킷 만들기(두 변형 + 대조군) ──
const pk = await buildPack({ diagnoses: DX, seed: 7, variants: ['base', 'topic'], loaders, legacy, now })
assert.equal(pk.packet.diagnoses.length, 2); assert.deepEqual(pk.problems.filter((p) => !/좋은 대조군/.test(p)), [])
assert.equal(legacyCalls.length, 2, '같은 실행에서 기존 경로를 진단마다 한 번')
for (const kd of pk.key.diagnoses) {
  const kinds = Object.values(kd.panels).sort()
  assert.deepEqual(kinds.filter((k) => k !== 'good'), ['bad', 'base', 'legacy', 'topic'], '두 변형 열 + 기존 + 나쁜 대조군')
  assert.equal(Object.keys(kd.pairs).length, 2, '시험①: 기존 vs 변형마다 한 쌍')
  for (const pr of Object.values(kd.pairs)) assert.ok(kd.panels[pr.legacy_label] === 'legacy' && kd.panels[pr.variant_label] === pr.variant)
}
const k5 = pk.key.diagnoses.find((d) => d.id === 'syn-5'), p5 = pk.packet.diagnoses.find((d) => d.id === 'syn-5')
assert.ok(Object.values(k5.panels).includes('good'), '좋은 대조군 있음(영역⑤ 픽스처)')
const panelOf = (pd, kd, kind) => pd.panels.find((p) => p.label === Object.entries(kd.panels).find(([, k]) => k === kind)[0])
// 블라인드 — 채점자 파일에 경로·플래그·점수식·코드·대조군 정체·실회사명·내부 slug 가 없다
const packetText = JSON.stringify(pk.packet) + packetMarkdown(pk.packet) + JSON.stringify(pk.template) + JSON.stringify(formSchema())
for (const w of ['legacy', 'story_flow', 'story flow', 'stageFirst', 'topic', 'retrieveSimilar', 'selectStoryFlow', 'enrich', 'variant', 'control', '대조', '0.35', '0.30', 'base', '"bad"', '"good"', 'fxt-', 'fx-sales', 'Acme', 'has_pitch', 'STORY_FLOW', 'slug'])
  assert.ok(!packetText.includes(w), `채점자 파일에 "${w}" 없음`)
assert.equal(p5.info.bottleneck, '사람들이 잘 모른다', '병목 코드 대신 말로')
assert.ok(!JSON.stringify(pk.key).includes('customer_story'), 'key 에도 고객 이야기 원문을 다시 담지 않는다')
// 같은 형식: 모든 칸이 같은 머리·사례 이름 '사례 N'
for (const d of pk.packet.diagnoses) for (const p of d.panels) {
  assert.ok(p.markdown.startsWith(`### 결론서 ${p.label}\n\n**비슷한 사례**\n\n`), '모든 칸 같은 머리')
  assert.ok(p.items.every((it, i) => it.name === `사례 ${i + 1}`), '회사명 대신 표시용 이름')
}
const top5 = panelOf(p5, k5, 'topic')
assert.ok(top5.markdown.includes('⚠ 잘 안 풀린 경우') && top5.items.some((it) => it.mark === '잘 안 풀린 경우'), '실패 사례 표시')
assert.ok(!top5.markdown.includes('이 사례는 잘 안 풀린 경우입니다 —'), '실패 앞말 대신 표시 칸(형식 통일)')
assert.ok(top5.items.some((it) => it.quote_orig && it.quote_ko) && top5.markdown.includes('   - 번역: "'), '인용에 한국어 번역 병기')
assert.ok(panelOf(p5, k5, 'legacy').items[0].what.startsWith('리뷰 답글'), '기존 경로 목록도 같은 형식으로')
// 대조군
const bad5 = panelOf(p5, k5, 'bad')
assert.equal(bad5.items.length, 3); assert.deepEqual(k5.notes.bad, { generic: 2, other_area: 1 }, '나쁜 대조군 = 일반론 2 + 다른 영역 사례 1')
assert.equal(bad5.items.filter((it) => GENERIC_ADVICE.some((g) => g.what === it.what)).length, 2)
assert.ok(panelOf(p5, k5, 'good').items.every((it) => !it.mark), '좋은 대조군은 잘 된 사례만')
assert.ok(panelOf(p5, k5, 'good').items.some((it) => /리뷰|검색/.test(it.what)), '좋은 대조군은 같은 영역·병목 주제')
// 결정성·시드
const pk2 = await buildPack({ diagnoses: DX, seed: 7, variants: ['base', 'topic'], loaders, legacy, now })
assert.equal(pk2.packet.packet_id, pk.packet.packet_id, '같은 시드 = 같은 패킷')
const orders = new Set(); for (const s of [1, 2, 3, 4, 5, 6]) orders.add(JSON.stringify((await buildPack({ diagnoses: DX, seed: s, variants: ['topic'], loaders, legacy, now })).key.diagnoses[0].panels))
assert.ok(orders.size > 1, '시드마다 칸 순서가 섞인다')
// 한 변형만
const one = await buildPack({ diagnoses: DX, seed: 7, variants: ['topic'], loaders, legacy, now })
assert.ok(one.key.diagnoses.every((d) => !Object.values(d.panels).includes('base') && Object.keys(d.pairs).length === 1))
// 새 경로가 ok 가 아니면 결론서 실경로처럼 기존 목록이 나간다(key 에 fallback)
const fb = await buildPack({ diagnoses: [DX[0]], seed: 7, variants: ['topic'], loaders: { flowCards: async () => [] }, legacy, now })
assert.ok(fb.key.diagnoses[0].notes.topic.fallback && fb.problems.some((p) => /좋은 대조군 0건/.test(p)))
assert.equal(fb.key.diagnoses[0].notes.bad.other_area, 0, '다른 영역이 없으면 일반론 3건')
// 기존 경로 실패 → 그 진단은 빼고 문제로 / 한도 오류는 멈춤
const lf = await buildPack({ diagnoses: DX, seed: 7, variants: ['topic'], loaders, legacy: async (i) => { if (i.category.startsWith('리뷰')) throw new Error('db down'); return [] }, now })
assert.deepEqual(lf.packet.diagnoses.map((d) => d.id), ['syn-2']); assert.ok(lf.problems.some((p) => p.startsWith('syn-5 기존 경로 실패')))
class StopRun extends Error {}
await assert.rejects(buildPack({ diagnoses: DX, seed: 7, loaders, legacy: async () => { throw new StopRun('quota') }, now }))
assert.equal(renderPanel('Z', []).includes('(제시된 사례 없음)'), true)
assert.deepEqual(PACK_ITEMS, SCORE_ITEMS, '패킷·채점 항목 6개가 같다')

// ── E3 후보 덤프 + 외부 좋은 대조군 ──
const dc = await buildPack({ diagnoses: DX, seed: 7, variants: ['topic'], loaders, legacy, now, dumpCandidates: true })
assert.equal(dc.candidates.length, 2); assert.equal(dc.key.good_controls, 'auto', '--good-controls 없으면 기존 동작(자동)')
assert.equal(dc.packet.packet_id, one.packet.packet_id, '후보 덤프는 패킷을 바꾸지 않는다')
const cd5 = dc.candidates.find((c) => c.id === 'syn-5')
assert.ok(cd5.new_candidates.length > 0 && cd5.new_candidates.length <= 40 && cd5.legacy_candidates[0].name === 'Acme Legacy Corp')
const ep0 = cd5.new_candidates.flatMap((c) => c.episodes).find((e) => e.quote_orig)
for (const f of ['action_ko', 'result_ko', 'adversity_ko', 'condition_ko', 'quote_orig', 'quote_ko', 'chapter', 'evidence_strength', 'result_class']) assert.ok(f in ep0, `후보 에피소드에 ${f}`)
assert.ok(!JSON.stringify(dc.candidates).includes('fxt-') && !JSON.stringify(dc.candidates).includes('fx-sales'), '후보에 내부 slug 대신 표시용 이름')
const quoted = (id) => dc.candidates.find((c) => c.id === id).new_candidates.flatMap((c) => c.episodes).filter((e) => e.quote_orig)
const gcFor = (id) => ({ cases: quoted(id).slice(0, 3).map((e, i) => ({ display_name: `Hidden Brand ${id}-${i}`, what: `${e.action_ko} → ${e.result_ko}`, why: '같은 손님·같은 막힘', quote_orig: e.quote_orig.split(/(?<=\.)\s/)[0], quote_ko: e.quote_ko })) })
const GC = { 'syn-5': gcFor('syn-5'), 'syn-2': gcFor('syn-2') }
for (const id of Object.keys(GC)) while (GC[id].cases.length < 3) GC[id].cases.push({ display_name: 'x', what: '추가 사례 — 결과 확인', why: '', quote_orig: '', quote_ko: '' })
const ge = await buildPack({ diagnoses: DX, seed: 7, variants: ['topic'], loaders, legacy, now, goodControls: GC })
assert.deepEqual(ge.goodErrors, []); assert.equal(ge.key.good_controls, 'external')
const kg = ge.key.diagnoses.find((d) => d.id === 'syn-5'), pg = ge.packet.diagnoses.find((d) => d.id === 'syn-5'), gp = panelOf(pg, kg, 'good')
assert.equal(gp.items.length, 3); assert.ok(gp.markdown.startsWith(`### 결론서 ${gp.label}\n\n**비슷한 사례**\n\n1. **사례 1**\n   - 무엇을 했나: `), '외부 대조군도 같은 형식')
assert.ok(gp.items[0].quote_orig === GC['syn-5'].cases[0].quote_orig && gp.markdown.includes('   - 번역: '))
assert.equal(kg.notes.good.source, 'external'); assert.ok(!JSON.stringify(ge.packet).includes('Hidden Brand'), '표시용 이름은 패킷에 안 나간다(사례 N)')
assert.ok(!ge.problems.some((p) => /좋은 대조군/.test(p)))
const tamper = JSON.parse(JSON.stringify(GC)); tamper['syn-5'].cases[0].quote_orig = 'We invented this quote entirely.'
assert.ok((await buildPack({ diagnoses: DX, seed: 7, loaders, legacy, now, goodControls: tamper })).goodErrors.some((e) => /syn-5 좋은 대조군 1 인용이 후보 원문에 없음/.test(e)), '지어낸 인용 = 실패')
assert.ok((await buildPack({ diagnoses: DX, seed: 7, loaders, legacy, now, goodControls: { 'syn-5': GC['syn-5'] } })).goodErrors.some((e) => /^syn-2 좋은 대조군 없음/.test(e)), '빠진 진단 = 실패')
assert.ok((await buildPack({ diagnoses: DX, seed: 7, loaders, legacy, now, goodControls: { ...GC, ghost: GC['syn-2'] } })).goodErrors.some((e) => /ghost/.test(e)), '입력에 없는 진단 id = 실패')
assert.ok((await buildPack({ diagnoses: DX, seed: 7, loaders, legacy, now, goodControls: { ...GC, 'syn-2': { cases: GC['syn-2'].cases.slice(0, 2) } } })).goodErrors.some((e) => /2건/.test(e)), '3건이 아니면 실패')

// ── 합격선 상수 고정 ──
assert.deepEqual({ ...PASS }, { MEAN_ALL_MIN: 3.8, ITEM_MEAN_MIN: 3.5, SAMPLE_ITEM_MIN: 3.0, TEST1_WIN_OR_TIE_MIN: 0.70, TEST2_CONCRETE_MIN: 0.80, NO_REGRESSION: true, BAD_CONTROL_BELOW: 3.0 })
assert.ok(Object.isFrozen(PASS)); assert.equal(GOOD_CONTROL_MIN, 3.5)
const scoreSrc = readFileSync(here('./story-flow-eval-score.mjs'), 'utf8')
assert.ok(scoreSrc.includes('남헌 확정, CC 변경 금지'))
assert.ok(!/process\.env/.test(scoreSrc), '합격선을 env 로도 못 바꾼다')

// ── 합격 계산 경계값(합성 key) ──
const makeKey = (D, variants = ['topic']) => ({ packet_id: 'pk', variants, diagnoses: Array.from({ length: D }, (_, i) => ({ id: `d${i}`, panels: { A: 'legacy', B: 'topic', C: 'bad', D: 'good' }, pairs: { p1: { variant: 'topic', variant_label: 'B', legacy_label: 'A' } } })) })
const DEF = { legacy: 3, topic: 4, bad: 1, good: 5 }
const R = (key, grader, over = {}) => ({ packet_id: key.packet_id, grader, diagnoses: key.diagnoses.map((kd, i) => ({ id: kd.id,
  panels: Object.fromEntries(Object.entries(kd.panels).map(([l, kind]) => { const o = over[kind]?.(i) ?? {}; const s = o.s ?? DEF[kind]; const arr = Array.isArray(s) ? s : Array(6).fill(s)
    return [l, { ...Object.fromEntries(SCORE_ITEMS.map((k, j) => [k, arr[j]])), tomorrow_action: '내일 단골 손님 3명에게 리뷰를 부탁한다', action_concrete: o.c ?? true }] })),
  test1: [{ pair_id: 'p1', choice: over.test1?.(i) ?? 'B' }] })) })
const ev = (key, rs) => evaluate(key, rs)
const V = (key, rs) => ev(key, rs).variants.topic
let key = makeKey(5)
assert.equal(V(key, [R(key, 'opus')]).verdict, '합격')
// 6항목 평균 = 3.8 정확히(5진단 × 6항목, 항목마다 3 한 칸) → 합격 / 한 칸 내리면 3.7667 → 불합격(항목 평균은 3.6 으로 통과)
const m38 = (i) => ({ s: SCORE_ITEMS.map((_, k) => ((i + k) % 5 === 0 ? 3 : 4)) })
let v = V(key, [R(key, 'opus', { topic: m38 })])
assert.equal(v.stats.mean_all, 3.8); assert.ok(v.checks.mean_all.pass && v.pass, '평균 3.8 = 합격(경계 포함)')
v = V(key, [R(key, 'opus', { topic: (i) => (i === 1 ? { s: [3, 4, 4, 4, 4, 3] } : m38(i)) })])
assert.ok(!v.checks.mean_all.pass && v.checks.item_means.pass && v.verdict === '불합격', '평균 3.77 = 불합격')
// 항목별 평균 3.5(경계 포함) 통과 / 3.0 불합격 — 평균은 높게
key = makeKey(2)
v = V(key, [R(key, 'opus', { topic: (i) => ({ s: [i ? 4 : 3, 5, 5, 5, 5, 5] }) })])
assert.equal(v.stats.item_means.same_situation, 3.5); assert.ok(v.checks.item_means.pass && v.pass)
v = V(key, [R(key, 'opus', { topic: () => ({ s: [3, 5, 5, 5, 5, 5] }) })])
assert.ok(!v.checks.item_means.pass && v.checks.mean_all.pass && v.checks.sample_min_item.pass && !v.pass, '항목 평균 3.0 = 불합격')
// 어느 샘플에서도 3.0 미만 없음: 2 한 칸 → 불합격(항목 평균 3.5·전체 평균은 통과)
v = V(key, [R(key, 'opus', { topic: (i) => ({ s: [i ? 5 : 2, 5, 5, 5, 5, 5] }) })])
assert.ok(v.checks.item_means.pass && !v.checks.sample_min_item.pass && !v.pass)
// 샘플 = 채점자 × 진단(채점자 평균으로 접지 않는다): 한 채점자가 2, 다른 채점자가 4 → 평균 3 이어도 불합격
v = V(key, [R(key, 'opus', { topic: (i) => ({ s: [i ? 4 : 2, 5, 5, 5, 5, 5] }) }), R(key, 'fable', { topic: () => ({ s: [4, 5, 5, 5, 5, 5] }) })])
assert.equal(v.stats.min_item, 2); assert.ok(!v.checks.sample_min_item.pass)
// 시험 ①: 10진단, 승 5·무 2·패 3 = 0.70 합격 / 승 4·무 2·패 4 = 0.60 불합격
key = makeKey(10)
v = V(key, [R(key, 'opus', { test1: (i) => (i < 5 ? 'B' : i < 7 ? 'tie' : 'A') })])
assert.deepEqual([v.checks.test1_win_or_tie.value, v.checks.test1_win_or_tie.win, v.checks.test1_win_or_tie.tie, v.checks.test1_win_or_tie.loss], [0.7, 5, 2, 3]); assert.ok(v.pass)
v = V(key, [R(key, 'opus', { test1: (i) => (i < 4 ? 'B' : i < 6 ? 'tie' : 'A') })])
assert.ok(!v.checks.test1_win_or_tie.pass && !v.pass)
// 시험 ②: 5진단, 구체적 4/5 = 0.80 합격 / 3/5 불합격
key = makeKey(5)
assert.ok(V(key, [R(key, 'opus', { topic: (i) => ({ c: i !== 0 }) })]).checks.test2_concrete.pass)
v = V(key, [R(key, 'opus', { topic: (i) => ({ c: i > 1 }) })])
assert.ok(!v.checks.test2_concrete.pass && !v.pass)
// 후퇴 없음: 기존과 같으면 통과, 기존이 높으면 불합격
assert.ok(V(key, [R(key, 'opus', { legacy: () => ({ s: 4 }) })]).checks.no_regression.pass)
v = V(key, [R(key, 'opus', { legacy: () => ({ s: [5, 4, 4, 4, 4, 4] }) })])
assert.ok(!v.checks.no_regression.pass && v.checks.mean_all.pass && !v.pass)
// ── 대조군 신뢰 검사 → 그 회차 무효 ──
let res = ev(key, [R(key, 'opus', { bad: () => ({ s: 3 }) })])
assert.equal(res.rounds[0].status, '무효(대조군 신뢰 검사 실패)'); assert.equal(res.variants.topic.verdict, '무효(유효 회차 없음)'); assert.ok(!res.all_pass)
assert.ok(ev(key, [R(key, 'opus', { bad: () => ({ s: [3, 3, 3, 3, 3, 2] }) })]).rounds[0].valid, '나쁜 것 2.83 < 3.0 = 정상')
assert.ok(!ev(key, [R(key, 'opus', { good: () => ({ s: [4, 4, 3, 3, 3, 3] }) })]).rounds[0].valid, '좋은 것 3.33 < 3.5 = 무효')
const noGood = { ...key, diagnoses: key.diagnoses.map((d) => ({ ...d, panels: { A: 'legacy', B: 'topic', C: 'bad' } })) }
assert.ok(ev(noGood, [R(noGood, 'opus')]).rounds[0].control_failures.some((f) => /확인 불가/.test(f)), '좋은 대조군이 없으면 확인 불가 = 무효')
// 무효 회차는 빼고 유효 회차로만 판정
res = ev(key, [R(key, 'opus', { bad: () => ({ s: 4 }) }), R(key, 'fable')])
assert.deepEqual([res.rounds[0].valid, res.rounds[1].valid, res.valid_rounds, res.variants.topic.verdict], [false, true, 1, '합격'])
// 형식 오류 = 확인 불가(점수로 접지 않는다)
const broken = R(key, 'opus'); delete broken.diagnoses[2].panels.C
assert.ok(parseResponse(broken, key).errors.some((e) => /d2\/C 채점 없음/.test(e)))
const six = R(key, 'opus'); six.diagnoses[0].panels.B.novelty = 6
const wrongPk = { ...R(key, 'opus'), packet_id: 'other' }
const badChoice = R(key, 'opus', { test1: () => 'C' })
const noAction = R(key, 'opus'); noAction.diagnoses[0].panels.B.tomorrow_action = ' '
for (const r of [broken, six, wrongPk, badChoice, noAction]) assert.equal(ev(key, [r]).rounds[0].status, '무효(확인 불가 — 응답 형식)')
// ── 두 채점자 일치도 ──
assert.equal(pearson([1, 2, 3], [2, 4, 6]), 1); assert.equal(pearson([1, 1, 1], [1, 2, 3]), null, '분산 0 = 확인 불가'); assert.equal(pearson([1], [1]), null)
key = makeKey(4)
const vary = (d) => (i) => ({ s: SCORE_ITEMS.map((_, k) => Math.min(5, 2 + ((i + k) % 3) + d)) })
res = evaluate(key, [R(key, 'opus', { topic: vary(0) }), R(key, 'fable', { topic: vary(1) })], { agree: true })
const ag = res.agreements[0].items.same_situation
assert.equal(res.agreements[0].a, 'opus'); assert.equal(ag.n, 16); assert.ok(ag.r > 0.9); assert.ok(ag.mean_diff < 0 && ag.mean_abs_diff > 0)
assert.equal(evaluate(key, [R(key, 'opus')], { agree: true }).agreements[0].note.includes('확인 불가'), true)

// ── CLI 끝까지(패킷 → 응답 → 채점) + 합격선은 인자로 못 바꾼다 ──
const tmp = mkdtempSync(join(tmpdir(), 'sf-eval-'))
try {
  const run = (script, args) => spawnSync(process.execPath, [here(script), ...args], { encoding: 'utf8', cwd: here('..') })
  writeFileSync(join(tmp, 'dx.json'), JSON.stringify({ diagnoses: DX }))
  let p = run('./story-flow-eval-pack.mjs', ['--diagnoses', join(tmp, 'dx.json'), '--out', join(tmp, 'o'), '--seed', '3', '--variants', 'both'])
  assert.ok([0, 1].includes(p.status), p.stderr)
  const kk = JSON.parse(readFileSync(join(tmp, 'o', 'key.json'), 'utf8')), tpl = JSON.parse(readFileSync(join(tmp, 'o', 'packet', 'form-template.json'), 'utf8'))
  assert.equal(tpl.packet_id, kk.packet_id); assert.equal(kk.mode, 'dry')
  for (const d of tpl.diagnoses) {
    const kd = kk.diagnoses.find((x) => x.id === d.id)
    for (const [l, s] of Object.entries(d.panels)) { const kind = kd.panels[l]; for (const k of SCORE_ITEMS) s[k] = { legacy: 3, base: 4, topic: 4, bad: 1, good: 5 }[kind]; s.tomorrow_action = '내일 단골 3명에게 리뷰를 부탁한다'; s.action_concrete = true }
    for (const t of d.test1) t.choice = kd.pairs[t.pair_id].variant_label
  }
  writeFileSync(join(tmp, 'opus.json'), JSON.stringify({ ...tpl, grader: 'opus' })); writeFileSync(join(tmp, 'fable.json'), JSON.stringify({ ...tpl, grader: 'fable' }))
  const s = run('./story-flow-eval-score.mjs', ['--key', join(tmp, 'o', 'key.json'), '--responses', join(tmp, 'opus.json'), join(tmp, 'fable.json'), '--agree', '--out', join(tmp, 'res.json')])
  assert.equal(s.status, 0, s.stdout + s.stderr); assert.ok(s.stdout.includes('[base] 합격') && s.stdout.includes('[topic] 합격'))
  assert.equal(run('./story-flow-eval-score.mjs', ['--key', join(tmp, 'o', 'key.json'), '--responses', join(tmp, 'opus.json'), '--MEAN_ALL_MIN', '1']).status, 64, '합격선 인자는 거부')
  assert.equal(run('./story-flow-eval-pack.mjs', ['--diagnoses', join(tmp, 'dx.json')]).status, 64)
  // E3 CLI: 후보 덤프 → 외부 좋은 대조군 → 패킷 / 지어낸 인용이면 종료 1·패킷 안 씀
  p = run('./story-flow-eval-pack.mjs', ['--diagnoses', join(tmp, 'dx.json'), '--out', join(tmp, 'o3'), '--dump-candidates', join(tmp, 'cand'), '--good-controls', join(tmp, 'gc.json')])
  assert.equal(p.status, 2, '대조군 파일을 못 읽으면 2')
  writeFileSync(join(tmp, 'gc.json'), JSON.stringify(GC)); writeFileSync(join(tmp, 'gc-bad.json'), JSON.stringify(tamper))
  p = run('./story-flow-eval-pack.mjs', ['--diagnoses', join(tmp, 'dx.json'), '--out', join(tmp, 'o3'), '--dump-candidates', join(tmp, 'cand'), '--good-controls', join(tmp, 'gc.json')])
  assert.equal(p.status, 0, p.stderr); assert.equal(JSON.parse(readFileSync(join(tmp, 'cand', 'candidates.json'), 'utf8')).diagnoses.length, 2)
  assert.equal(JSON.parse(readFileSync(join(tmp, 'o3', 'key.json'), 'utf8')).good_controls, 'external')
  p = run('./story-flow-eval-pack.mjs', ['--diagnoses', join(tmp, 'dx.json'), '--out', join(tmp, 'o4'), '--good-controls', join(tmp, 'gc-bad.json')])
  assert.equal(p.status, 1); assert.throws(() => readFileSync(join(tmp, 'o4', 'key.json')), '검사 실패면 패킷·key 를 쓰지 않는다')
  writeFileSync(join(tmp, 'bad.json'), JSON.stringify([{ id: 'x', area: '9' }]))
  assert.equal(run('./story-flow-eval-pack.mjs', ['--diagnoses', join(tmp, 'bad.json'), '--out', join(tmp, 'o2')]).status, 2)
} finally { rmSync(tmp, { recursive: true, force: true }) }

const packSrc = readFileSync(here('./story-flow-eval-pack.mjs'), 'utf8')
assert.ok(!/\.(insert|upsert|delete)\(|\.update\(\s*\{/.test(packSrc + scoreSrc), '평가 스크립트는 DB 에 쓰지 않는다')
console.log('story-flow-eval-selftest: 통과')
