#!/usr/bin/env node
// Reddit Data API 파서 셀프테스트 — 네트워크 없이 픽스처로만 돈다.
//
// ⚠️ 픽스처는 응답의 **구조만** 보존한다. 제목·본문은 합성값이다.
//
// 여기서 고정하는 것:
//   · `sort=new` 가 URL 에 **반드시** 있는가 (없으면 증분 종료가 오작동)
//   · 토큰이 없으면 요청을 아예 만들지 않는가 (교환 실패 = 그 소스만 건너뜀)
//   · 토큰이 **헤더**로 가는가 (URL 에 실리면 로그에 남는다)
//   · `selftext: ""`(링크 포스트, 정상) 와 `selftext` 키 부재(구조 변경, 실패)를 가르는가
//   · `after` 부재 = 종료
//   · authorMasked 가 항상 null 인가

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRedditAdapter, LIMIT } from '../lib/review/adapters/reddit.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const fx = (name) => fs.readFile(path.join(here, '..', 'fixtures', 'review', 'reddit', name), 'utf8')

let pass = 0
let fail = 0
const t = (name, got, want) => {
  if (got === want) pass++
  else {
    fail++
    console.log(`FAIL  ${name}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`)
  }
}
const ok = (name, cond) => t(name, Boolean(cond), true)

const page1 = await fx('page1.json')
const page2 = await fx('page2-last.json')
const empty = await fx('empty.json')

const adapter = createRedditAdapter('TEST_TOKEN')
const noToken = createRedditAdapter(null)

const target = (over = {}) => ({
  id: 't1',
  projectId: 'p1',
  sourceKey: 'reddit',
  productRef: 'q:AirPods',
  cursor: null,
  lastReviewAt: null,
  consecutiveEmpty: 0,
  ...over,
})
const ctx = (cursor = null) => ({ productRef: 'q:AirPods', cursor })

// ── URL 계약 ──────────────────────────────────────────────────────
{
  const req = adapter.nextRequest(target())
  // ⛔ 공개 `.json` 스크래핑 경로가 아니라 OAuth 호스트 하나만 쓴다.
  ok('oauth.reddit.com 만 쓴다', req.url.startsWith('https://oauth.reddit.com/search'))
  ok('⛔ www.reddit.com 을 건드리지 않는다', !req.url.includes('www.reddit.com'))
  ok('⚠️ sort=new 가 URL 에 있다 — 없으면 관련도순이라 증분 종료가 깨진다', req.url.includes('sort=new'))
  ok('t=all', req.url.includes('t=all'))
  ok(`limit=${LIMIT}`, req.url.includes(`limit=${LIMIT}`))
  ok('raw_json=1', req.url.includes('raw_json=1'))
  ok('첫 요청엔 after 가 없다', !req.url.includes('after='))

  t('토큰이 헤더로 간다', req.headers.Authorization, 'Bearer TEST_TOKEN')
  ok('⛔ 토큰이 URL 에 들어가지 않는다', !req.url.includes('TEST_TOKEN'))
  t('robotsPolicy 는 official-api', adapter.robotsPolicy, 'official-api')
  t('requiredEnv 2개', adapter.requiredEnv.join(','), 'REDDIT_CLIENT_ID,REDDIT_CLIENT_SECRET')
}
{
  const req = adapter.nextRequest(target({ cursor: 't3_synth02' }))
  ok('커서가 after 로 간다', req.url.includes('after=t3_synth02'))
  ok('커서가 있어도 sort=new 는 유지된다', req.url.includes('sort=new'))
}
{
  // 토큰 교환이 실패하면 이 소스만 조용히 멈춘다 — 요청을 한 건도 안 보낸다.
  t('토큰이 없으면 nextRequest 가 null', noToken.nextRequest(target()), null)
  t('product_ref 형식이 아니면 null', adapter.nextRequest(target({ productRef: 'AirPods' })), null)
  t('빈 질의면 null', adapter.nextRequest(target({ productRef: 'q:' })), null)
}

// ── 파싱 ──────────────────────────────────────────────────────────
{
  const r = adapter.parse(page1, ctx())
  // 4건 중: 본문 있음 1 / 링크 포스트(빈 selftext) 1 / selftext 키 부재 1 / 본문 있음 1
  t('정상 3건 파싱', r.reviews.length, 3)

  // ⚠️ 이 두 줄이 이 셀프테스트의 핵심이다.
  //    빈 문자열은 링크 포스트라 **정상**이고, 키 부재는 **구조 변경**이다.
  //    합쳐 세면 건강도 판정이 구조 변경을 영영 못 본다(설계 §5.5).
  t('selftext 빈 문자열은 정상 — 실패로 세지 않는다', r.parseFailures, 1)
  ok(
    'selftext 빈 문자열 포스트도 제목이 본문으로 들어간다',
    r.reviews.some((x) => x.text.includes('link post with empty selftext is normal')),
  )
  ok(
    'selftext 키가 없는 포스트는 적재되지 않는다',
    !r.reviews.some((x) => x.externalId === 't3_synth03'),
  )

  t('after 가 커서가 된다', r.nextCursor, 't3_synth02')

  const a = r.reviews[0]
  t('externalId 는 fullname(t3_...)', a.externalId, 't3_synth01')
  ok('적재 접두에 서브레딧과 permalink 가 박힌다', a.text.startsWith('[Reddit r/headphones · /r/headphones/comments/synth01/'))
  ok('제목이 본문에 들어간다', a.text.includes('left bud keeps disconnecting'))
  ok('본문이 들어간다', a.text.includes('Rolled back twice'))
  t('created_utc → writtenAt', a.writtenAt, new Date(1789000000 * 1000).toISOString().slice(0, 10))
  t('별점 없음', a.rating, null)
  t('판매처 없음', a.seller, null)
  ok('⛔ authorMasked 는 항상 null', r.reviews.every((x) => x.authorMasked === null))
}
{
  const r = adapter.parse(page2, ctx('t3_synth02'))
  t('마지막 페이지 1건', r.reviews.length, 1)
  t('after 가 null 이면 커서 null', r.nextCursor, null)
}
{
  const r = adapter.parse(empty, ctx())
  t('children 0건은 정상 종료', r.parseFailures, 0)
  t('children 0건이면 커서 null', r.nextCursor, null)
}
{
  t('JSON 이 아니면 파싱 실패 1건', adapter.parse('<html>', ctx()).parseFailures, 1)
  t('children 이 없으면 파싱 실패 1건', adapter.parse('{"data":{}}', ctx()).parseFailures, 1)
  t('data 가 없으면 파싱 실패 1건', adapter.parse('{"kind":"Listing"}', ctx()).parseFailures, 1)
}

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) {
  console.log('Reddit 파서가 틀렸다. 빈 본문과 구조 변경을 가르는 경계가 걸려 있다.')
  process.exit(1)
}
console.log('Reddit 파서 정상 — 정렬·커서·토큰 위치·빈 본문 판별이 맞물린다.')
