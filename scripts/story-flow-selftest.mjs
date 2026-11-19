#!/usr/bin/env node
// [v71ct §4 회귀 테스트] lib/consult/story-flow.ts — 모델·DB 불필요. 종료 코드 0 = 통과.
import assert from 'node:assert/strict'
import { eligible, pickFlowCards, situationMatch, mayClaimSuccess, loadStoryFlow, BOTTLENECK_CHAPTERS } from '../lib/consult/story-flow.ts'

const ep = (o = {}) => ({ episode_idx: 0, chapter: 5, role: 'primary', sub_topic: 'cold_email', adversity_ko: '손님이 안 온다', action_ko: '콜드메일', overcome_ko: null, result_class: 'positive', result_grain: 'metric', result_ko: '고객 40명', why_ko: null, condition_ko: null, mechanism: 'm_a', quote_orig: null, quote_ko: null, evidence_strength: 'A', ...o })
const card = (slug, o = {}, eps = [ep()]) => ({ slug, chapter: 5, weight: 40, chapter_why_ko: null, customer: 'smb', pricing_model: 'subscription', price_band: '10-49', stage: 'early_rev', team_size: 'solo', domain: 'x', story_arc_ko: null, causal_chain: [], success_tier: 'S1', relevance_tier: 'R1', principle_ko: 'p', transfer_ko: 't', episodes: eps, ...o })
const diag = { chapter: 5, situation: { customer: 'smb', price_band: '10-49', stage: 'early_rev', team_size: 'solo', pricing_model: 'subscription' }, adversity: '손님이 안 온다' }

// ① 적격: 비중 30 미만·결과 없는 카드는 걸러진다 — 모름은 거르지 않는다
assert.equal(eligible(card('a', { weight: 20 }), 5), false)
assert.equal(eligible(card('a', {}, [ep({ result_class: 'none', result_grain: null })]), 5), false)
assert.equal(eligible(card('a', { customer: 'unknown', price_band: 'unknown', stage: 'unknown', team_size: 'unknown' }), 5), true)
// ② 모름은 감점(0.5)이지 탈락·0점이 아니다
assert.equal(situationMatch(card('a'), diag.situation), 1)
assert.equal(situationMatch(card('a', { customer: 'unknown' }), diag.situation), 0.9)
assert.equal(situationMatch(card('a', { customer: 'enterprise' }), diag.situation), 0.8)
// ③ 후보 3건 이상이면 추천 1 + 대안 2, 미만이면 insufficient(폴백 신호)
const many = ['a', 'b', 'c', 'd'].map((s, i) => card(s, { stage: i ? 'growing' : 'early_rev' }))
let r = pickFlowCards(many, diag)
assert.equal(r.status, 'ok'); assert.ok(r.recommended); assert.equal(r.alternatives.length, 2)
assert.equal(pickFlowCards(many.slice(0, 2), diag).status, 'insufficient')
// ④ signal·none·learned 는 "됐다"로 못 쓴다
assert.equal(mayClaimSuccess({ result_class: 'positive', result_grain: 'signal' }), false)
assert.equal(mayClaimSuccess({ result_class: 'none', result_grain: null }), false)
assert.equal(mayClaimSuccess({ result_class: 'positive', result_grain: 'learned' }), false)
assert.equal(mayClaimSuccess({ result_class: 'positive', result_grain: 'qual' }), true)
// ⑤ 실패 사례 카드가 후보에 있으면 3건 안에 들어간다(성공만 보여 주지 않는다)
const wins = ['w1', 'w2', 'w3', 'w4'].map((s) => card(s, { causal_chain: [{ from_ep: 0, to_ep: 1, because_ko: 'x' }] }))
const fail = card('f1', { stage: 'growing', team_size: '11+' }, [ep({ result_class: 'negative', result_grain: 'qual', evidence_strength: 'C' })])
r = pickFlowCards([...wins, fail], diag)
assert.ok([r.recommended, ...r.alternatives].some((p) => p.hasFailure), '실패 카드 포함')
// ⑥ 다른 업종: 원리 태그가 있으면 "다른 업종, 같은 원리", 없으면 쓰지 않는다
const x1 = card('x1', { relevance_tier: 'R3' }, [ep({ mechanism: 'm_a' })]), x2 = card('x2', { relevance_tier: 'R3' }, [ep({ mechanism: null })])
r = pickFlowCards([x1, x2, card('s1'), card('s2')], { ...diag, mechanism: 'm_a' })
const all = [r.recommended, ...r.alternatives]
assert.ok(all.some((p) => p.card.slug === 'x1' && p.crossIndustry && p.similarWhy.startsWith('다른 업종, 같은 원리')))
assert.ok(!all.some((p) => p.card.slug === 'x2'), '원리 태그 없는 다른 업종 카드는 쓰지 않는다')
// ⑦ 두 줄 이유는 라벨에서만: 모두 비어 있으면 일반 문구, 숫자·비율 문장 없음
assert.ok(all.every((p) => !/\d+곳 중/.test(p.similarWhy + p.persuasiveWhy)))
// ⑧ 깃발 OFF 이면 DB 를 건드리지 않고 off — 출력은 기존 경로 그대로
delete process.env.STORY_FLOW_ENABLED
let touched = false
const res = await loadStoryFlow({ from: () => { touched = true; throw new Error('조회하면 안 됨') } }, diag)
assert.equal(res.status, 'off'); assert.equal(touched, false)
// ⑨ 깃발 ON + 조회 실패는 not_run(근거 부족이 아니다 — §7.1)
process.env.STORY_FLOW_ENABLED = 'true'
const res2 = await loadStoryFlow({ from: () => ({ select: () => ({ eq: () => ({ gte: () => { const q = { order: () => q, range: async () => ({ data: null, error: { message: 'boom' } }) }; return q } }) }) }) }, diag)
assert.equal(res2.status, 'not_run')
// ⑩ 병목→장 대응표
assert.deepEqual(BOTTLENECK_CHAPTERS.not_paying, [6]); assert.deepEqual(BOTTLENECK_CHAPTERS.new_channels, [5])
console.log('story-flow-selftest: 통과')
