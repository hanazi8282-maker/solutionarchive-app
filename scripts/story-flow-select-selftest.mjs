#!/usr/bin/env node
// [v71cu 2-3~2-8 회귀] lib/consult/story-flow-select.ts — 모델·DB 불필요. 종료 코드 0 = 통과. consult-selftest 가 불러 CI 에서 돈다.
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fetchFlowCards } from '../lib/consult/story-flow.ts'
import { scoreCard, evidenceScore, recencyScore, dedupeBySlug, selectStoryFlow, chooseSimilar, diagnosisFromReport, selectionToSimilar, verifyQuotes, iGa, similarWhyV2, displayName, anchorEpisode, sourceAllowed, stageFirst, FAILED_NOTE, quoteSlugs, sourceFromRows, collectQuotes, cardFromMoveTag, cardFromCaseBank, W } from '../lib/consult/story-flow-select.ts'

const fx = JSON.parse(readFileSync(new URL('../fixtures/story-flow/cards.json', import.meta.url), 'utf8'))
const now = new Date('2026-11-19T00:00:00Z')
const quiet = async (f) => { const o = console.error; console.error = () => {}; try { return await f() } finally { console.error = o } }
const [A, B1, B2, C, D] = fx.cards
const dSales = fx.diagnoses.area2_sales_assistant

// ① 점수식: 0.35×weight + 0.30×상황 + 0.15×mechanism + 0.15×증거 + 0.05×최신성 — 가중치 합 1
assert.equal(Number(Object.values(W).reduce((a, b) => a + b, 0).toFixed(6)), 1)
const rec = 1 - (now - Date.parse(A.created_at)) / (365.25 * 864e5) / 3
assert.equal(scoreCard(A, dSales, now), Number((0.35 * 0.6 + 0.30 * 1 + 0.15 * 1 + 0.15 * 1 + 0.05 * rec).toFixed(4)))
// ② 모름=0.5: 진단에 mechanism 없음·created_at 없음 → 0.5. signal 결과의 증거는 0
assert.equal(recencyScore(D, now), 0.5)
assert.equal(evidenceScore(B2), 0, 'signal 은 증거 0')
assert.equal(evidenceScore(C), 0.6)
const noMech = { ...dSales, mechanism: undefined }
assert.ok(Math.abs(scoreCard(A, dSales, now) - scoreCard(A, noMech, now) - 0.15 * 0.5) < 1e-3, '진단 mechanism 모름 = 0.5')
// ③ 회사(slug)당 1장 — 가장 높은 장만
const dd = dedupeBySlug([{ slug: 'x', score: 0.2, n: 1 }, { slug: 'x', score: 0.7, n: 2 }, { slug: 'y', score: 0.1, n: 3 }])
assert.equal(dd.length, 2); assert.equal(dd.find((x) => x.slug === 'x').n, 2)

// ④ story flow 3장 이상 → story flow 만, 폴백 로더는 부르지 않는다 · 회사당 1장 · 추천1+대안2 · 이유 2개
let fbCalled = false
const sales = fx.cards.filter((c) => c.chapter === 6)
let s = await selectStoryFlow(dSales, { flowCards: async () => sales, moveTags: async () => { fbCalled = true; return [] }, caseBank: async () => { fbCalled = true; return [] } }, { now })
assert.equal(s.status, 'ok'); assert.equal(fbCalled, false)
const picks = [s.recommended, ...s.alternatives]
assert.equal(picks.length, 3); assert.ok(picks.every((p) => p.source === 'story_flow'))
assert.equal(new Set(picks.map((p) => p.slug)).size, 3, '회사당 1장')
assert.equal(s.recommended.slug, 'fx-sales-a', '병목 장 → 가장 비슷한 상황 → 설득력: 상황·원리·증거 모두 맞는 A')
assert.ok(picks.every((p) => p.reasons.length === 2 && p.reasons.every((r) => r.length > 0)))
assert.ok(picks.every((p) => !/\d+곳 중/.test(p.reasons.join(' '))), '비율 문장 없음(R10 전)')
// ⑤ 2장 이상이면 안 된 시도 포함(C 는 상황이 안 맞아 점수가 낮아도 3건 안에 든다)
assert.ok(picks.some((p) => p.hasFailure), '안 된 시도 포함')
// ⑥ 다른 업종(R3)은 원리 태그가 있어야만 — D 는 있으므로 후보, 원리 없는 R3 는 빠진다
const noMechR3 = { ...D, slug: 'fx-r3-nomech', episodes: D.episodes.map((e) => ({ ...e, mechanism: null })) }
s = await selectStoryFlow(dSales, { flowCards: async () => [...sales, noMechR3] }, { now })
assert.ok(![s.recommended, ...s.alternatives].some((p) => p.slug === 'fx-r3-nomech'))
// ⑦ 부족하면 ss_move_tags_current → case_bank 순서로 채운다
const dRev = fx.diagnoses.area5_review_writing
const order = []
s = await selectStoryFlow(dRev, {
  flowCards: async () => fx.cards.filter((c) => c.chapter === 5).slice(0, 1),
  moveTags: async () => { order.push('mt'); return fx.move_tags.map(cardFromMoveTag) },
  caseBank: async (ch) => { order.push('cb'); return fx.case_bank.map((r) => cardFromCaseBank(r, ch)) },
}, { now })
assert.equal(s.status, 'ok'); assert.deepEqual(order, ['mt', 'cb'])
assert.deepEqual([s.recommended, ...s.alternatives].map((p) => p.source), ['story_flow', 'move_tags', 'case_bank'])
assert.equal(s.alternatives[0].quote, null, '꼬리표·사례 은행에는 원문 인용이 없다')
// ⑧ story flow 조회 실패 = not_run(근거 부족 아님) · 폴백 조회 실패로 3건 못 채우면 not_run
s = await selectStoryFlow(dRev, { flowCards: async () => { throw new Error('timeout') } })
assert.equal(s.status, 'not_run')
s = await selectStoryFlow(dRev, { flowCards: async () => [], moveTags: async () => { throw new Error('boom') } })
assert.equal(s.status, 'not_run'); assert.ok(s.note.includes('move_tags 조회 실패'))
s = await selectStoryFlow(dRev, { flowCards: async () => [] })
assert.equal(s.status, 'insufficient')

// ⑨ 깃발 분기: OFF 면 story flow 를 부르지 않고 legacy 결과 그대로(기존 경로 100%)
delete process.env.STORY_FLOW_ENABLED
let sfCalled = false
const legacyRows = [{ name: 'L', what: 'w' }]
let r = await chooseSimilar({ legacy: async () => legacyRows, storyFlow: async () => { sfCalled = true; throw new Error('부르면 안 됨') }, toItems: selectionToSimilar })
assert.equal(sfCalled, false); assert.equal(r.similar, legacyRows); assert.equal(r.storyFlow, undefined)
process.env.STORY_FLOW_ENABLED = 'TRUE'
r = await chooseSimilar({ legacy: async () => legacyRows, storyFlow: async () => { sfCalled = true; return {} }, toItems: selectionToSimilar })
assert.equal(sfCalled, false, "'true' 가 아니면 OFF(대소문자 다르면 OFF)")
process.env.STORY_FLOW_ENABLED = 'true'
const ok = await selectStoryFlow(dSales, { flowCards: async () => sales }, { now })
r = await chooseSimilar({ legacy: async () => legacyRows, storyFlow: async () => ok, toItems: selectionToSimilar })
assert.equal(r.similar.length, 3); assert.ok(r.similar.every((x) => x.name && x.what && x.why)); assert.equal(r.storyFlow, ok)
r = await chooseSimilar({ legacy: async () => legacyRows, storyFlow: async () => ({ status: 'insufficient', alternatives: [], considered: {}, note: '' }), toItems: selectionToSimilar })
assert.equal(r.similar, legacyRows, 'ON 이어도 ok 가 아니면 legacy')
delete process.env.STORY_FLOW_ENABLED

// ⑩ 진단 → 장: 상황 답(병목)이 우선, 없으면 Fit 끊긴 단계, ⬜·0 은 장 없음
assert.deepEqual(diagnosisFromReport({ bottleneck: '와서 가입을 안 한다' }).chapters, [6, 5])
assert.equal(diagnosisFromReport({ viability: { fit_broken_stage: 2, fit_color: '🔴' }, revenue_band: '0' }).chapter, 5)
assert.equal(diagnosisFromReport({ viability: { fit_broken_stage: 2, fit_color: '🔴' }, revenue_band: '0' }).situation.stage, 'zero_rev')
assert.equal(diagnosisFromReport({ viability: { fit_broken_stage: 0, fit_color: '⬜' } }), null)
assert.equal(diagnosisFromReport({}), null)

// ⑪ 2-2 로더: 사본(mat)이 있으면 그것만, 없거나 오류면 기존 뷰로 폴백, 둘 다 실패면 던진다
const fakeSb = (byTable) => { const hit = []; return { hit, from: (t) => { hit.push(t); const res = byTable[t]; const q = { select: () => q, eq: () => q, gte: () => q, order: (c) => { hit.push('order:' + c); return q }, range: async () => res }; return q } } }
let sb = fakeSb({ story_flow_cards_mat: { data: [A], error: null }, story_flow_cards: { data: [B1], error: null } })
assert.deepEqual((await fetchFlowCards(sb, 6)).map((c) => c.slug), ['fx-sales-a']); assert.deepEqual(sb.hit.filter((h) => !h.startsWith('order:')), ['story_flow_cards_mat']); assert.ok(sb.hit.includes('order:slug'), '[F4] 쪽 조회에 ORDER BY')
sb = fakeSb({ story_flow_cards_mat: { data: null, error: { message: 'relation "story_flow_cards_mat" does not exist' } }, story_flow_cards: { data: [B1], error: null } })
assert.deepEqual((await quiet(() => fetchFlowCards(sb, 6))).map((c) => c.slug), ['fx-sales-b']); assert.deepEqual(sb.hit.filter((h) => !h.startsWith('order:')), ['story_flow_cards_mat', 'story_flow_cards'])
sb = fakeSb({ story_flow_cards_mat: { data: null, error: { message: 'x' } }, story_flow_cards: { data: null, error: { message: 'canceling statement due to statement timeout' } } })
await assert.rejects(() => quiet(() => fetchFlowCards(sb, 6)), /statement timeout/)

// ⑫ 2-8 인용 검증: 원문과 같으면 통과, 한 글자라도 다르거나 원문을 못 찾으면 실패
const src = Object.fromEntries(fx.cards.map((c) => [c.slug, c.episodes]))
const okSel = await selectStoryFlow(dSales, { flowCards: async () => sales }, { now })
const v = verifyQuotes({ ch1: {}, story_flow: okSel }, src)
assert.ok(v.checked >= 3); assert.equal(v.mismatches.length, 0)
const bad = structuredClone(okSel); bad.recommended.quote.text = bad.recommended.quote.text.replace('doubled', 'tripled')
assert.equal(verifyQuotes({ story_flow: bad }, src).mismatches[0].reason, 'text_differs')
assert.equal(verifyQuotes({ story_flow: okSel }, {}).mismatches[0].reason, 'source_missing', '원문 못 찾음 = 실패(확인 불가를 통과로 접지 않는다)')
assert.equal(verifyQuotes({ q: { quote: { slug: 'fx-sales-a', episode_idx: 9, text: 'x' } } }, src).mismatches[0].reason, 'episode_missing')
assert.equal(verifyQuotes({ q: { quote: { slug: 'fx-sales-a', episode_idx: 0, text: '  We put every  price on one page and   conversions doubled. ' } } }, src).mismatches.length, 0, '공백 차이는 같은 인용')

// ⑬ 깃발 기본값·마이그 경계: 코드 기본은 OFF, 워크플로가 ON 으로 켜지 않는다, 새 마이그는 기존 뷰를 바꾸지 않는다
const sfSrc = readFileSync(new URL('../lib/consult/story-flow.ts', import.meta.url), 'utf8')
assert.ok(sfSrc.includes("process.env.STORY_FLOW_ENABLED === 'true'"))
const wf = readdirSync(new URL('../.github/workflows/', import.meta.url)).map((f) => readFileSync(new URL(`../.github/workflows/${f}`, import.meta.url), 'utf8')).join('\n')
assert.ok(!/STORY_FLOW_ENABLED\s*[:=]\s*['"]?true/i.test(wf), '워크플로가 STORY_FLOW_ENABLED 를 켜지 않는다')
const mig = readFileSync(new URL('../supabase/migrations/20261119000030_story_flow_cards_mat.sql', import.meta.url), 'utf8').replace(/--.*$/gm, '')
assert.ok(/CREATE MATERIALIZED VIEW IF NOT EXISTS public\.story_flow_cards_mat/.test(mig) && !/(DROP|ALTER|CREATE OR REPLACE VIEW)[^;]*story_flow_cards\b(?!_mat)/i.test(mig))
const rb = readFileSync(new URL('../supabase/migrations/20261119000030_story_flow_cards_mat_rollback.sql', import.meta.url), 'utf8').replace(/--.*$/gm, '')
assert.ok(/DROP MATERIALIZED VIEW IF EXISTS public\.story_flow_cards_mat;/.test(rb) && !/story_flow_cards\b(?!_mat)/.test(rb))
// ── 독립 검수 수정(F1~F6) ──
// F1 조사: 받침 판별
assert.equal(iGa('팀 크기'), '가'); assert.equal(iGa('단계'), '가'); assert.equal(iGa('손님'), '이'); assert.equal(iGa('값대'), '가')
s = await selectStoryFlow(dSales, { flowCards: async () => sales }, { now })
const all1 = [s.recommended, ...s.alternatives]
assert.ok(all1.every((p) => !/[가-힣]이 같다/.test(p.reasons[0]) || /손님이 같다/.test(p.reasons[0])), '받침 없는 말 뒤에 "이" 를 붙이지 않는다')
assert.ok(s.recommended.reasons[0].includes('팀 크기가 같다'))
// F1 "같은 원리" 는 진단 원리와 실제로 같을 때만. D(R3)는 원리가 같으면 "다른 업종, 같은 원리:", 진단에 원리가 없으면 "다른 업종:" 만
const pD = all1.find((p) => p.slug === 'fx-sales-d'); assert.ok(pD.reasons[0].startsWith('다른 업종, 같은 원리: '))
s = await selectStoryFlow({ ...dSales, mechanism: undefined }, { flowCards: async () => sales }, { now })
assert.ok(![s.recommended, ...s.alternatives].some((p) => p.reasons[0].includes('같은 원리')), '진단 원리 없음 → "같은 원리" 금지')
const wD = similarWhyV2(D, { ...dSales, mechanism: undefined }, anchorEpisode(D))
assert.ok(wD.startsWith('다른 업종: ') && !wD.includes('같은 원리'))
s = await selectStoryFlow({ ...dSales, mechanism: 'other_mech' }, { flowCards: async () => sales }, { now })
assert.ok(![s.recommended, ...s.alternatives].some((p) => p.reasons[0].includes('같은 원리')), '원리가 다르면 "같은 원리" 금지')
// F1 요약·인용·설득력 이유가 같은 에피소드 하나에서
const twoEp = { ...A, slug: 'fx-two', episodes: [
  { ...A.episodes[0], episode_idx: 0, result_grain: 'qual', action_ko: '말로만', result_ko: '좋아졌다', quote_orig: 'It felt better.', evidence_strength: 'B' },
  { ...A.episodes[0], episode_idx: 1, result_grain: 'metric', action_ko: '숫자로', result_ko: '두 배', quote_orig: 'Revenue doubled in a month.', evidence_strength: 'A' }] }
assert.equal(anchorEpisode(twoEp).episode_idx, 1)
s = await selectStoryFlow(dSales, { flowCards: async () => [twoEp, B1, C] }, { now })
const pt = [s.recommended, ...s.alternatives].find((p) => p.slug === 'fx-two')
assert.equal(pt.quote.episode_idx, 1); assert.ok(pt.summary_ko.startsWith('숫자로')); assert.ok(pt.reasons[1].startsWith('숫자로 확인된 결과'))
// F2 화면 이름: UUID·해시 꼬리 제거, 불가하면 "비슷한 사례 N", 화면 칸(selectionToSimilar)에 UUID 없음
assert.equal(displayName('attributer-0a5ef6f5-a401-4077-a10b-ffc9f88b9c71', 1), 'Attributer')
assert.equal(displayName('my-app-3fa9c1d2', 1), 'My App')
assert.equal(displayName('0a5ef6f5-a401-4077-a10b-ffc9f88b9c71', 2), '비슷한 사례 2')
assert.equal(displayName('case_bank:합성사례 가', 1), '합성사례 가')
const uuidCards = sales.map((c, i) => ({ ...c, slug: `${c.slug}-${'0a5ef6f5-a401-4077-a10b-ffc9f88b9c7' + i}` }))
const items = selectionToSimilar(await selectStoryFlow(dSales, { flowCards: async () => uuidCards }, { now }))
assert.equal(items.length, 3); assert.ok(items.every((x) => !/[0-9a-f]{8}-[0-9a-f]{4}/i.test(x.name)), '화면 이름에 UUID 없음')
assert.ok(readFileSync(new URL('../lib/consult/report/compose.ts', import.meta.url), 'utf8').includes('toItems: selectionToSimilar'), 'compose 노출 지점이 selectionToSimilar(displayName) 를 쓴다')
// F3 인용: strict 기본 — 문장 중간 발췌 실패 · 문장 단위 통과 · loose 는 경고 · 0건 실패 · 원천 허용 목록
const orig = { s: [{ episode_idx: 0, quote_orig: 'Café growth was not good at all. Then we fixed onboarding.' }] }
assert.equal(verifyQuotes({ quote: { slug: 's', episode_idx: 0, text: 'good at all' } }, orig).mismatches[0].reason, 'not_sentence')
assert.ok(verifyQuotes({ quote: { slug: 's', episode_idx: 0, text: 'Then we fixed onboarding.' } }, orig).ok, '문장 단위 일치는 통과')
const loose = verifyQuotes({ quote: { slug: 's', episode_idx: 0, text: 'good at all' } }, orig, { mode: 'loose' })
assert.ok(loose.ok && loose.warnings.some((w) => w.warn === 'negation_nearby') && loose.warnings.some((w) => w.warn === 'short_excerpt'))
const none = verifyQuotes({ story_flow: { alternatives: [] } }, orig)
assert.equal(none.ok, false); assert.equal(none.mismatches[0].reason, 'no_quotes')
assert.equal(verifyQuotes({ quote: { slug: 's', episode_idx: 0, text: 'Then we fixed onboarding.', label_run: 'r2' } }, { s: [{ ...orig.s[0], label_run: 'r1' }] }).mismatches[0].reason, 'episode_missing', 'label_run 이 다르면 같은 원문이 아니다')
assert.equal(sourceAllowed({ source_key: 'starterstory' }), true); assert.equal(sourceAllowed({ source_key: 'dcinside' }), false); assert.equal(sourceAllowed({}), false)
const foreign = sales.map((c) => ({ ...c, source_key: 'dcinside' }))
s = await selectStoryFlow(dSales, { flowCards: async () => foreign }, { now }); assert.equal(s.considered.story_flow, 0, '허용 목록 밖 원천은 카드·인용 0')
process.env.STORY_FLOW_QUOTE_SOURCES = 'dcinside'
s = await selectStoryFlow(dSales, { flowCards: async () => foreign }, { now }); assert.ok(s.considered.story_flow > 0)
delete process.env.STORY_FLOW_QUOTE_SOURCES
const qcSrc = readFileSync(new URL('./story-flow-quote-check.mjs', import.meta.url), 'utf8')
assert.ok(qcSrc.includes("from('ss_episode_tags')") && !qcSrc.includes("from('ss_episode_tags_current')"), '--db 는 원본 표를 읽는다')
// F5 새로 고침 함수 마이그·롤백·스크립트
const fn = readFileSync(new URL('../supabase/migrations/20261119000031_story_flow_refresh_fn.sql', import.meta.url), 'utf8').replace(/--.*$/gm, '')
assert.ok(/REFRESH MATERIALIZED VIEW public\.story_flow_cards_mat/.test(fn) && /SECURITY DEFINER/.test(fn) && /SET search_path = ''/.test(fn) && /REVOKE ALL ON FUNCTION[^;]*FROM PUBLIC, anon, authenticated/.test(fn) && /GRANT EXECUTE[^;]*TO service_role/.test(fn))
const fnRb = readFileSync(new URL('../supabase/migrations/20261119000031_story_flow_refresh_fn_rollback.sql', import.meta.url), 'utf8').replace(/--.*$/gm, '')
assert.ok(/DROP FUNCTION IF EXISTS public\.refresh_story_flow_cards_mat\(\);/.test(fnRb) && !/MATERIALIZED/.test(fnRb))
const { spawnSync } = await import('node:child_process')
const pr = spawnSync(process.execPath, [new URL('./story-flow-refresh.mjs', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), '--print'], { encoding: 'utf8' })
assert.equal(pr.status, 0); assert.ok(pr.stdout.includes('REFRESH MATERIALIZED VIEW public.story_flow_cards_mat;'))
// F6 실제 경로 진단은 장·단계만 채운다(설계 한계 고정 — 칸을 늘리면 이 테스트를 갱신한다)
for (const v of Object.values(fx.real_inputs)) { const d = diagnosisFromReport(v); assert.ok(d && Object.keys(d.situation).join() === 'stage' && !d.mechanism) }
// ── 재검수 수정(G1~G4) ──
// G1 안 된 시도 카드는 payload(failed·fail_kind)와 화면 문구 모두에 표시
s = await selectStoryFlow(dSales, { flowCards: async () => sales }, { now })
const pc = [s.recommended, ...s.alternatives].find((p) => p.slug === 'fx-sales-c')
assert.equal(pc.failed, true); assert.equal(pc.fail_kind, 'negative')
assert.equal(s.recommended.failed, false)
const failRec = { status: 'ok', recommended: { ...pc }, alternatives: [s.recommended], considered: {}, note: '' }
const fi = selectionToSimilar(failRec)
assert.ok(fi[0].failed === true && fi[0].what.startsWith(FAILED_NOTE.negative), '추천 자리 실패 사례에 "잘 안 풀린 경우" 표시')
assert.ok(fi[1].failed === false && !fi[1].what.includes('안 풀린'))
// G2 동점: 상황 일치 → 진단 단계 같은 카드 → 증거 → slug (점수식 불변)
const dZ = { chapter: 5, situation: { stage: 'zero_rev', customer: 'smb' } }
const base5 = fx.cards.find((c) => c.slug === 'fx-review-a')
const tie = (slug, o) => ({ ...base5, slug, customer: 'unknown', price_band: 'unknown', team_size: 'unknown', pricing_model: 'unknown', ...o })
const X = tie('zz-stage-match', { stage: 'zero_rev', customer: 'enterprise' }), Y = tie('aa-stage-unknown', { stage: 'unknown', customer: 'unknown' })
assert.equal(scoreCard(X, dZ, now), scoreCard(Y, dZ, now), '점수 같음(전제)')
s = await selectStoryFlow(dZ, { flowCards: async () => [Y, X, tie('mm-third', { stage: 'growing', weight: 40 })] }, { now })
assert.equal(s.recommended.slug, 'zz-stage-match', '동점이면 slug 알파벳이 아니라 진단 단계가 같은 카드가 먼저')
// G3 추천 자리 단계 우선: 기본 OFF(결과 불변), 옵션 ON 이면 단계 다른 1순위를 한 칸 아래로
const P = (slug, stage) => ({ slug, slug_internal: slug, stage })
assert.deepEqual(stageFirst([P('a', 'growing'), P('b', 'zero_rev'), P('c', 'growing')], 'zero_rev').map((x) => x.slug), ['b', 'a', 'c'])
assert.deepEqual(stageFirst([P('a', 'growing'), P('b', 'growing')], 'zero_rev').map((x) => x.slug), ['a', 'b'], '둘 다 다르면 그대로')
assert.deepEqual(stageFirst([P('a', 'unknown'), P('b', 'zero_rev')], 'zero_rev').map((x) => x.slug), ['a', 'b'], '카드 단계 모름은 다르다고 보지 않는다')
assert.deepEqual(stageFirst([P('a', 'growing'), P('b', 'zero_rev')], undefined).map((x) => x.slug), ['a', 'b'], '진단 단계 모름이면 그대로')
const stCards = [tie('s1-growing', { stage: 'growing', weight: 90 }), tie('s2-zero', { stage: 'zero_rev', weight: 60 }), tie('s3-zero', { stage: 'zero_rev', weight: 50 })]
const offSel = await selectStoryFlow(dZ, { flowCards: async () => stCards }, { now })
const onSel = await selectStoryFlow(dZ, { flowCards: async () => stCards }, { now, stageFirst: true })
assert.equal(offSel.recommended.slug, 's1-growing', '기본 OFF — 점수 순 그대로')
assert.equal(onSel.recommended.slug, 's2-zero'); assert.equal(onSel.alternatives[0].slug, 's1-growing')
assert.ok(!readFileSync(new URL('../lib/consult/report/compose.ts', import.meta.url), 'utf8').includes('stageFirst'), 'compose(결론서)는 단계 우선 규칙을 켜지 않는다')
// G4 저장본: UUID slug 원문은 slug_internal 에만, slug·name·화면 칸에는 없다
const UU = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const uSel = await selectStoryFlow(dSales, { flowCards: async () => uuidCards }, { now })
const leaks = []
const walk = (v, k) => { if (typeof v === 'string') { if (UU.test(v) && k !== 'slug_internal') leaks.push(k) } else if (v && typeof v === 'object') for (const [kk, vv] of Object.entries(v)) walk(vv, kk) }
walk(uSel, ''); assert.deepEqual(leaks, [], 'payload.story_flow 에 slug_internal 밖 UUID 없음')
assert.ok([uSel.recommended, ...uSel.alternatives].every((p) => UU.test(p.slug_internal) && !UU.test(p.slug) && !UU.test(p.name)))
const uItems = selectionToSimilar(uSel)
assert.ok(uItems.every((x) => !('slug_internal' in x) && !UU.test(JSON.stringify(x))), '화면 렌더 칸에는 내부 키·UUID 없음')
assert.ok(verifyQuotes({ story_flow: uSel }, Object.fromEntries(uuidCards.map((c) => [c.slug, c.episodes]))).ok, '인용 검증은 slug_internal 로 원문을 찾는다')
// 회귀(2026-11-19 실DB): G4 뒤 quote-check --db 가 q.slug 로 조회해 전부 source_missing — 원문 키 slug_internal 로 원본 표를 찾는다
const samplePayload = { diagnosis: dSales, before: { status: 'ok', alternatives: [] }, after: uSel, quote_check: {} }   // story-flow-samples.mjs 출력 모양
const qs = collectQuotes(samplePayload)
assert.equal(qs.length, 3)
assert.deepEqual(quoteSlugs(qs).sort(), [uSel.recommended, ...uSel.alternatives].map((p) => p.slug_internal).sort(), '조회 slug = slug_internal(UUID 포함 원문)')
assert.ok(quoteSlugs(qs).every((x) => UU.test(x)))
const rows = uuidCards.flatMap((c) => c.episodes.map((e) => ({ source_key: c.source_key, slug: c.slug, label_run: c.label_run, episode_idx: e.episode_idx, quote_orig: e.quote_orig })))   // ss_episode_tags 줄 모양
const dbCheck = verifyQuotes(samplePayload, sourceFromRows(rows.filter((r) => quoteSlugs(qs).includes(r.slug))))
assert.ok(dbCheck.ok && dbCheck.checked === 3, '원본 표 줄로 3/3 일치')
const cleanedOnly = JSON.parse(JSON.stringify(samplePayload)); for (const q of collectQuotes(cleanedOnly)) { q.slug = q.slug_internal.replace(UU, '').replace(/-$/, ''); delete q.slug_internal }
const co = verifyQuotes(cleanedOnly, sourceFromRows(rows))
assert.ok(!co.ok && co.mismatches.length === 3 && co.mismatches.every((m) => m.reason === 'source_missing'), '정리된 slug 만 있는 payload 는 원문을 못 찾아 실패')
assert.ok(!verifyQuotes(samplePayload, sourceFromRows(rows.map((r) => ({ ...r, label_run: 'other_run' })))).ok, 'label_run 이 다른 원문은 같은 인용으로 보지 않는다')
const cli = readFileSync(new URL('./story-flow-quote-check.mjs', import.meta.url), 'utf8')
assert.ok(cli.includes('quoteSlugs(quotes)') && cli.includes('sourceFromRows(') && !/quotes.map((q) => q.slug)/.test(cli), 'CLI --db 가 공용 조회 키 함수를 쓴다')
console.log('story-flow-select-selftest: 통과')
