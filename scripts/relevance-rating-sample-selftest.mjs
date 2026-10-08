#!/usr/bin/env node
// T2 판정 표본 평점 우선 자르기(v31 §2.3, pickSampleByRating) 셀프테스트 — 픽스처만(네트워크·DB·LLM 없음).
//   node scripts/relevance-rating-sample-selftest.mjs
//
// 지키는 것
//   1) 평점 혼합 → 1~3점 먼저, 4~5점은 ceil(n × share) 까지. 저 200·고 100·n=200 → 저 160·고 40.
//   2) 평점 전부 null(HN·카카오·커뮤니티) → 기존 slice(0, n) 과 같은 순서. 여기가 접히면 평점 없는 소스가 밀린다.
//   3) 한쪽이 모자라면 다른 쪽으로 채운다(관련 후보를 버리지 않는다).
//   4) 비율 0·1 경계, env 파서, 결정적 순서.
//   5) 호출부 배선 — 함수만 맞고 relevance-judge-auto 가 안 부르면 효과가 정확히 0 이다.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { DEFAULT_HIGH_RATING_SHARE, parseHighRatingShare, pickSampleByRating } from '../lib/analysis/relevance-judge.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
let pass = 0
let fail = 0
const t = (name, cond) => { if (cond) pass++; else { fail++; console.log(`FAIL  ${name}`) } }

// selectInputs().selected 모양: { input: { id, rating }, text }
const mk = (prefix, count, rating) => Array.from({ length: count }, (_, i) => ({ input: { id: `${prefix}${i}`, rating }, text: '' }))
const ratingOf = (s) => s.input.rating
const ids = (xs) => xs.map((s) => s.input.id)
const pick = (items, n, share = DEFAULT_HIGH_RATING_SHARE) => pickSampleByRating(items, n, share, ratingOf)

// 1) 혼합 — 저 200·고 100·n=200 → 저 160·고 40 (T1 순서가 섞여 있어도)
{
  const low = mk('L', 200, 2)
  const high = mk('H', 100, 5)
  const mixed = []
  for (let i = 0; i < 300; i++) mixed.push(i % 3 === 0 ? high[i / 3] : low[i - Math.ceil(i / 3)])
  const { sample, stats } = pick(mixed, 200)
  t('혼합: 표본 200', sample.length === 200)
  t('혼합: 저 160·고 40·상한 40', stats.low === 160 && stats.high === 40 && stats.high_cap === 40 && stats.none === 0)
  t('혼합: 저평점은 T1 순서 앞에서부터', ids(sample.slice(0, 160)).join() === ids(low.slice(0, 160)).join())
  t('혼합: 고평점도 T1 순서 앞에서부터', ids(sample.slice(160)).join() === ids(high.slice(0, 40)).join())
  t('혼합: rating 0 은 low', pick([...mk('Z', 1, 0), ...mk('H', 5, 4)], 2, 0.5).stats.low === 1)
  t('혼합: 3 은 low, 4 는 high', (() => { const s = pick([...mk('A', 1, 3), ...mk('B', 1, 4)], 2, 0.5).stats; return s.low === 1 && s.high === 1 })())
}

// 2) 전부 null → 기존 slice 와 동일 순서
{
  const all = mk('N', 300, null)
  const { sample, stats } = pick(all, 200)
  t('null: 기존 slice(0,n) 과 같은 순서', ids(sample).join() === ids(all.slice(0, 200)).join())
  t('null: 통계 none 200', stats.none === 200 && stats.low === 0 && stats.high === 0)
  const undef = all.map((s) => ({ input: { id: s.input.id }, text: '' })) // rating 필드 자체가 없음
  t('undefined: 기존 slice 와 같음', ids(pick(undef, 200).sample).join() === ids(all.slice(0, 200)).join())
  // null 은 low 줄에 같이 선다 — 평점 없는 소스를 뒤로 밀지 않는다
  const mixNull = [...mk('H', 50, 5), ...mk('N', 50, null)]
  const r = pick(mixNull, 50)
  t('null+고평점: null 이 high 보다 앞(40 null + 10 high)', r.stats.none === 40 && r.stats.high === 10)
}

// 3) 저평점 부족 — 저 20·고 300·n=200 → 저 20·고 180
{
  const { sample, stats } = pick([...mk('H', 300, 5), ...mk('L', 20, 1)], 200)
  t('저 부족: 저 20·고 180', stats.low === 20 && stats.high === 180 && sample.length === 200)
}

// 4) 고평점 부족 — 저 300·고 10·n=200 → 저 190·고 10
{
  const { stats } = pick([...mk('L', 300, 3), ...mk('H', 10, 4)], 200)
  t('고 부족: 저 190·고 10', stats.low === 190 && stats.high === 10)
}

// 5) 전체가 n 보다 적음 → 전부
{
  const { sample } = pick([...mk('L', 5, 2), ...mk('H', 5, 5)], 200)
  t('전체 < n: 10건 전부', sample.length === 10)
  t('n=0: 빈 표본', pick(mk('L', 5, 2), 0).sample.length === 0)
}

// 6) 비율 경계 0·1, ceil
{
  const items = [...mk('L', 300, 2), ...mk('H', 300, 5)]
  const s0 = pick(items, 200, 0).stats
  t('share 0: 고 0', s0.high === 0 && s0.low === 200 && s0.high_cap === 0)
  const s0short = pick([...mk('L', 30, 2), ...mk('H', 300, 5)], 200, 0).stats
  t('share 0 + 저 부족: 고로 채움', s0short.low === 30 && s0short.high === 170)
  const s1 = pick(items, 200, 1).stats
  t('share 1: 고 200', s1.high === 200 && s1.low === 0)
  const s1short = pick([...mk('L', 300, 2), ...mk('H', 30, 5)], 200, 1).stats
  t('share 1 + 고 부족: 저로 채움', s1short.high === 30 && s1short.low === 170)
  t('ceil: n=7·0.2 → 상한 2', pick(items, 7).stats.high_cap === 2 && pick(items, 7).stats.high === 2)
}

// 7) 결정적 — 같은 입력이면 같은 출력, 입력을 바꾸지 않는다
{
  const items = [...mk('H', 100, 4), ...mk('L', 200, 1), ...mk('N', 50, null)]
  const before = ids(items).join()
  const a = ids(pick(items, 200).sample).join()
  const b = ids(pick(items, 200).sample).join()
  t('결정적: 두 번 같은 결과', a === b)
  t('결정적: 입력 배열 불변', ids(items).join() === before)
}

// 8) env 파서
t('env: 미설정 → null(기본값)', parseHighRatingShare(undefined) === null && parseHighRatingShare('') === null)
t('env: 0 허용', parseHighRatingShare('0') === 0)
t('env: 1 허용', parseHighRatingShare('1') === 1)
t('env: 0.35', parseHighRatingShare('0.35') === 0.35)
t('env: 범위 밖·문자 → null', parseHighRatingShare('1.5') === null && parseHighRatingShare('-0.1') === null && parseHighRatingShare('abc') === null)
t('기본 비율 0.2', DEFAULT_HIGH_RATING_SHARE === 0.2)

// 9) 호출부 배선
{
  const src = readFileSync(`${ROOT}scripts/relevance-judge-auto.mjs`, 'utf8')
  t('배선: SELECT 에 rating', /\.select\('id, raw_text, created_at, collected_at, rating'\)/.test(src))
  t('배선: selectInputs 결과를 pickSampleByRating 으로 자른다', /pickSampleByRating\(selectInputs\(inputs\)\.selected, sampleSize, highRatingShare/.test(src))
  t('배선: 옛 slice(0, sampleSize) 가 남지 않았다', !src.includes('.slice(0, sampleSize)'))
  t('배선: env RELEVANCE_HIGH_RATING_SHARE', src.includes('process.env.RELEVANCE_HIGH_RATING_SHARE'))
  t('배선: tracker detail 에 high_rating_share·rating_mix', src.includes('high_rating_share: highRatingShare') && src.includes('rating_mix'))
  t('배선: 프로젝트 줄 로그에 저·고·상한·없음', /평점 저 .* · 고 .*\/상한 .* · 없음/.test(src))
}

console.log(`relevance-rating-sample-selftest: ${pass} pass, ${fail} fail`)
process.exit(fail ? 1 : 0)
