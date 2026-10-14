#!/usr/bin/env node
// shadow-rejudge-v71c.mjs 의 순수 함수(allocate·wilson)와 보고 집계(summarize) 검사. DB·LLM 없음.
import assert from 'node:assert/strict'
import { allocate, wilson } from './shadow-rejudge-v71c.mjs'
import { summarize } from './shadow-rejudge-report-v71c.mjs'

let pass = 0
const t = (name, fn) => { fn(); pass++; console.log(`✓ ${name}`) }

t('allocate: 합이 n, 비례, 층 크기 초과 없음', () => {
  const a = allocate([{ key: 'a', size: 600 }, { key: 'b', size: 300 }, { key: 'c', size: 100 }], 100)
  assert.equal([...a.values()].reduce((s, x) => s + x, 0), 100)
  assert.deepEqual([a.get('a'), a.get('b'), a.get('c')], [60, 30, 10])
})
t('allocate: 작은 층이 크기를 못 넘는다', () => {
  const a = allocate([{ key: 'a', size: 1 }, { key: 'b', size: 1000 }], 300)
  assert.ok(a.get('a') <= 1)
  assert.equal([...a.values()].reduce((s, x) => s + x, 0), 300)
})
t('allocate: 모집단이 n 보다 작으면 전부', () => {
  const a = allocate([{ key: 'a', size: 3 }, { key: 'b', size: 2 }], 300)
  assert.equal(a.get('a') + a.get('b'), 5)
})
t('allocate: 같은 입력이면 같은 결과(재현)', () => {
  const s = [{ key: 'x', size: 7 }, { key: 'y', size: 7 }, { key: 'z', size: 7 }]
  assert.deepEqual([...allocate(s, 10)], [...allocate(s, 10)])
})
t('wilson: n=0 은 null, 50/100 은 0.5 주변', () => {
  assert.deepEqual(wilson(0, 0), [null, null])
  const [lo, hi] = wilson(50, 100)
  assert.ok(lo > 0.39 && lo < 0.41 && hi > 0.59 && hi < 0.61)
})
t('summarize: 1차 미도착 행은 분모에 넣지 않는다(오류를 무관으로 접지 않는다)', () => {
  const rows = [
    { new_first: 'relevant', new_first_info: true, new_second: 'relevant', new_second_info: true, business_model: 'SaaS' },
    { new_first: 'irrelevant', new_first_info: false, new_second: 'relevant', new_second_info: true, new_first_reason: '영역 밖: 디자인', business_model: 'SaaS' },
    { new_first: null, new_first_info: null, new_second: null, new_second_info: null, business_model: 'SaaS' },
  ]
  const s = summarize(rows)
  assert.equal(s.n, 3); assert.equal(s.judged, 2); assert.equal(s.rel, 1); assert.equal(s.full, 1); assert.equal(s.outReason, 1)
})

console.log(`\n${pass} pass`)
