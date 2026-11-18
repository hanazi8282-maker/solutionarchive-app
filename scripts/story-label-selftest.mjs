#!/usr/bin/env node
// [v71ct] 스토리 꼬리표 자동 검사 셀프테스트(모델·DB 불필요). 종료 코드 0 = 통과.
import assert from 'node:assert/strict'
import { validate, numbersInText, normalizeFocus, firstJson } from '../lib/story-label/core.mjs'

const story = { full_text: 'We spent $10,000 on ads.\n\nIt made zero users. Then we  moved to cold email and got 40 customers.', revenue_mo: 20000 }
const moves = [{ move_idx: 0, lever: 'CHANNEL', move: 'x' }]
const valid = new Set([1, 2, 3, 4, 5, 6, 7, 8])
const ep = (o) => ({ chapter: 5, role: 'primary', sub_topic: 'Cold Email', result_class: 'positive', result_grain: 'metric', evidence_strength: 'A', ...o })
const base = (eps, extra = {}) => ({ situation: { customer: 'smb' }, situation_basis: { customer: 'moved to cold email' }, focus: [{ chapter: 5, weight: 100, why_ko: 'x' }], success_tier: 'S1', relevance_tier: 'R1', episodes: eps, ...extra })

// 1. 인용 글자 대조: 공백만 정규화 — 통과/실패
let v = validate(base([ep({ quote_orig: 'It made zero users.', quote_ko: 'k', result_ko: '고객 40명', move_idx: 0 }), ep({ quote_orig: 'It made no users.', quote_ko: 'k' })]), { story, moves, validChapters: valid })
assert.equal(v.flags.quoteTotal, 2); assert.equal(v.flags.quoteFail, 1)
assert.equal(v.episodes[0].quote_orig, 'It made zero users.'); assert.equal(v.episodes[1].quote_orig, null); assert.equal(v.episodes[1].quote_ko, null)
assert.equal(v.episodes[0]._move_idx, 0)
// 공백 차이(두 칸·줄바꿈)는 통과
v = validate(base([ep({ quote_orig: 'Then we moved to cold email', quote_ko: 'k' }), ep({})]), { story, moves, validChapters: valid })
assert.equal(v.flags.quoteFail, 0)
// 2. 숫자 대조: 전문에 없는 숫자는 result_ko 를 비우고 A→B
assert.equal(numbersInText('고객 40명, 매출 $10,000', story.full_text).ok, true)
assert.deepEqual(numbersInText('매출 $55000', story.full_text).missing, ['55000'])
v = validate(base([ep({ result_ko: '매출 $55000' }), ep({})]), { story, moves, validChapters: valid })
assert.equal(v.episodes[0].result_ko, null); assert.equal(v.episodes[0].evidence_strength, 'B'); assert.equal(v.flags.numFail, 1)
assert.equal(v.story.success_tier, 'S2') // 숫자 확인된 metric 줄이 없어 S1→S2
// 3. 상황 칸 근거: 전문에 없는 근거는 unknown
v = validate(base([ep({}), ep({})], { situation_basis: { customer: '전문에 없는 문장' } }), { story, moves, validChapters: valid })
assert.equal(v.story.customer, 'unknown'); assert.equal(v.flags.basisDropped, 1)
// 4. 구조: 에피소드 2~10, 정의 안 된 장은 버림, focus 에 에피소드 없는 장은 버림
v = validate(base([ep({})]), { story, moves, validChapters: valid }); assert.equal(v.ok, false)
v = validate(base([ep({ chapter: 11 }), ep({}), ep({})]), { story, moves, validChapters: valid }); assert.equal(v.flags.epDropped, 1); assert.equal(v.ok, true)
// 5. 비중 정리: 합 100·10단위·최대 4장·20 미만 버림
const f = normalizeFocus([{ chapter: 5, weight: 47 }, { chapter: 6, weight: 33 }, { chapter: 2, weight: 12 }, { chapter: 4, weight: 8 }], new Set([5, 6, 2, 4]))
assert.equal(f.reduce((s, x) => s + x.weight, 0), 100); assert.ok(f.every((x) => x.weight % 10 === 0 && x.weight >= 10)); assert.equal(f.length, 2)
assert.deepEqual(normalizeFocus([{ chapter: 9, weight: 100 }], new Set([5])), [])
// 6. signal·none 규칙: none 이면 grain 비움, positive 에 grain 없으면 qual
v = validate(base([ep({ result_class: 'none', result_grain: 'metric' }), ep({ result_grain: null })]), { story, moves, validChapters: valid })
assert.equal(v.episodes[0].result_grain, null); assert.equal(v.episodes[1].result_grain, 'qual')
// 7. JSON 추출
assert.deepEqual(firstJson('설명 {"a":{"b":"}"}} 뒤'), { a: { b: '}' } }); assert.equal(firstJson('no json'), null)
assert.equal(validate(null, { story, moves, validChapters: valid }).flags.badJson, true)
console.log('story-label-selftest: 통과')
