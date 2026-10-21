#!/usr/bin/env node
// relevance-unknown-rejudge 셀프테스트 — 순수함수만(DB·LLM 없음).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { REJUDGE_BUCKETS, reasonBucket, sampleIds, summarize } from './relevance-unknown-rejudge.mjs'

// 1) 오케스트레이터가 본 대표 문구 셋은 전부 "본문 정보 부족" 쪽(재판정 후보 아님)
assert.equal(reasonBucket('선호만 있고 이유 없음'), 'no_reason')
assert.equal(reasonBucket('자동 생성 크래시/오류 보고, 재현 단서 없음'), 'no_detail')
assert.equal(reasonBucket('상품명만 있어 본문 누락'), 'body_missing')
assert.ok(!['no_reason', 'no_detail', 'body_missing'].some((k) => REJUDGE_BUCKETS.includes(k)))
assert.equal(reasonBucket(''), 'empty_reason')
assert.equal(reasonBucket('경쟁 제품과 비교하는지 애매하다'), 'other')

// 2) 결정적 표본 — 같은 입력이면 같은 패널, 입력 순서와 무관
const ids = Array.from({ length: 300 }, (_, i) => `id-${i}`)
assert.deepEqual(sampleIds(ids, 100), sampleIds([...ids].reverse(), 100))
assert.equal(sampleIds(ids, 100).length, 100)

// 3) 요약 — 후보만 비용을 센다, 원문 길이 중앙값
const rows = [
  { input_id: 'a', reason: '상품명만 있어 본문 누락' }, { input_id: 'b', reason: '선호만 있고 이유 없음' },
  { input_id: 'c', reason: '경쟁 제품 언급이 애매' }, { input_id: 'd', reason: '' },
]
const s = summarize(rows, new Map([['a', 10], ['b', 30], ['c', 400], ['d', 50]]), 10)
assert.equal(s.total, 4)
assert.equal(s.candidates, 2)
assert.equal(s.buckets.body_missing.median_chars, 10)
assert.ok(s.cost_usd.gemini > 0 && s.cost_usd.claude_cli_nominal > s.cost_usd.gemini)
assert.deepEqual([...s.sample].sort(), ['c', 'd'])

// 4) 실행 모드가 없다 — LLM 호출·DB 쓰기 코드가 파일에 없다
const src = fs.readFileSync(new URL('./relevance-unknown-rejudge.mjs', import.meta.url), 'utf8')
assert.ok(!/callLlm|judgeRelevanceBatch|callGemini|\.upsert\(|\.update\(\{|\.insert\(|--run/.test(src.replace(/^\/\/.*$/gm, '')))

console.log('✅ relevance-unknown-rejudge selftest 통과')
