#!/usr/bin/env node
// YouTube Data API v3 파서 셀프테스트 — 네트워크 없이 픽스처로만 돈다.
//
// ⚠️ 픽스처는 응답의 **구조만** 보존한다. 댓글 본문·작성자는 합성값이다.
//
// 여기서 고정하는 것:
//   · `order=time` 이 URL 에 **반드시** 있는가 (없으면 증분 종료가 오작동)
//   · `nextPageToken` 부재 = 종료 (있는 값만 커서로 쓴다)
//   · 쿼터 소진 403 이 'quota' 로 분류되는가 (차단으로 세면 소스가 꺼진다)
//   · 🔴 댓글 비활성 403 은 'blocked' 로 분류된다 — 이게 사람이 알아야 할 함정이다
//   · authorMasked 가 항상 null 인가

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { youtubeAdapter, MAX_RESULTS, parseProductRef } from '../lib/review/adapters/youtube.ts'
import { classifyBlockedResponse } from '../lib/review/health.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const fx = (name) => fs.readFile(path.join(here, '..', 'fixtures', 'review', 'youtube', name), 'utf8')

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

process.env.YOUTUBE_API_KEY = 'TEST_KEY'

const page1 = await fx('page1.json')
const page2 = await fx('page2-last.json')
const quota = await fx('quota-403.json')
const disabled = await fx('comments-disabled-403.json')

const target = (over = {}) => ({
  id: 't1',
  projectId: 'p1',
  sourceKey: 'youtube',
  productRef: 'v:dQw4w9WgXcQ',
  cursor: null,
  lastReviewAt: null,
  consecutiveEmpty: 0,
  ...over,
})
const ctx = (cursor = null) => ({ productRef: 'v:dQw4w9WgXcQ', cursor })

// ── URL 계약 ──────────────────────────────────────────────────────
{
  const req = youtubeAdapter.nextRequest(target())
  ok('commentThreads 엔드포인트', req.url.startsWith('https://www.googleapis.com/youtube/v3/commentThreads'))
  ok('⚠️ order=time 이 URL 에 있다 — 없으면 관련도순이라 증분 종료가 깨진다', req.url.includes('order=time'))
  ok('part=snippet', req.url.includes('part=snippet'))
  ok(`maxResults=${MAX_RESULTS}`, req.url.includes(`maxResults=${MAX_RESULTS}`))
  ok('영상 ID 가 들어간다', req.url.includes('videoId=dQw4w9WgXcQ'))
  ok('첫 요청엔 pageToken 이 없다', !req.url.includes('pageToken='))
  // ⛔ search.list 는 10,000유닛 풀과 별개인 **하루 100회 전용 버킷**을 쓴다
  //    (유닛 비용은 1이라 싸 보이지만 버킷이 따로다). 타깃은 사람이 고른다.
  ok('⛔ search.list 를 부르지 않는다', !req.url.includes('/search?'))
  // main 러너(#152)는 robots 확인 불가를 fail-closed 로 다룬다. googleapis 는 robots 404 라
  // 이 표식이 없으면 전 요청이 robots-skip 으로 0건이 된다 — 조용한 실패다.
  t('robots 확인 불가 통과 표식 = www.googleapis.com', (youtubeAdapter.proceedWhenRobotsUnverified ?? []).join(','), 'www.googleapis.com')
  t('requiredEnv', youtubeAdapter.requiredEnv.join(','), 'YOUTUBE_API_KEY')
}
{
  const req = youtubeAdapter.nextRequest(target({ cursor: 'TOKEN_ABC' }))
  ok('커서가 pageToken 으로 간다', req.url.includes('pageToken=TOKEN_ABC'))
  ok('커서가 있어도 order=time 은 유지된다', req.url.includes('order=time'))
}
{
  t('product_ref 형식이 아니면 null', youtubeAdapter.nextRequest(target({ productRef: 'dQw4w9WgXcQ' })), null)
  t('영상 ID 길이가 다르면 null', youtubeAdapter.nextRequest(target({ productRef: 'v:tooshort' })), null)
  t('URL 을 통째로 넣으면 null', youtubeAdapter.nextRequest(target({ productRef: 'v:youtu.be/dQw4w9WgXcQ' })), null)
  t('정상 형식은 영상 ID 를 돌려준다', parseProductRef('v:dQw4w9WgXcQ'), 'dQw4w9WgXcQ')
}
{
  const key = process.env.YOUTUBE_API_KEY
  delete process.env.YOUTUBE_API_KEY
  t('키가 없으면 nextRequest 가 null', youtubeAdapter.nextRequest(target()), null)
  process.env.YOUTUBE_API_KEY = key
}

// ── 파싱 ──────────────────────────────────────────────────────────
{
  const r = youtubeAdapter.parse(page1, ctx())
  t('정상 항목 2건 파싱', r.reviews.length, 2)
  // topLevelComment 컨테이너가 없는 항목은 **구조 변경 신호**다. 조용히 버리면
  // "3건 보이는데 2건"이 "2건"으로만 보인다(§7.1).
  t('topLevelComment 없는 항목은 파싱 실패 1건', r.parseFailures, 1)
  t('nextPageToken 이 커서가 된다', r.nextCursor, 'SYNTHETIC_PAGE_TOKEN_2')

  const a = r.reviews[0]
  t('externalId 는 댓글 id', a.externalId, 'SyntheticComment001')
  ok('적재 접두에 영상 ID 가 박힌다', a.text.startsWith('[YouTube 댓글 · dQw4w9WgXcQ]'))
  ok('본문이 들어간다', a.text.includes('펌웨어 업데이트 뒤로 연결이 자꾸 끊깁니다'))
  t('publishedAt → writtenAt', a.writtenAt, '2026-09-15')
  t('별점 없음', a.rating, null)
  t('판매처 없음', a.seller, null)
  ok('⛔ authorMasked 는 항상 null', r.reviews.every((x) => x.authorMasked === null))
  ok('⛔ authorDisplayName 이 본문에도 안 들어간다', !r.reviews.some((x) => x.text.includes('합성_작성자')))
}
{
  const r = youtubeAdapter.parse(page2, ctx('SYNTHETIC_PAGE_TOKEN_2'))
  t('마지막 페이지 1건', r.reviews.length, 1)
  // ⚠️ 종료 신호는 nextPageToken 의 부재다. 페이지 번호를 우리가 세지 않는다.
  t('nextPageToken 이 없으면 커서 null', r.nextCursor, null)
}
{
  t('JSON 이 아니면 파싱 실패 1건', youtubeAdapter.parse('<html>', ctx()).parseFailures, 1)
  t('items 가 없으면 파싱 실패 1건', youtubeAdapter.parse('{"kind":"x"}', ctx()).parseFailures, 1)
  t('items 가 빈 배열이면 실패 0', youtubeAdapter.parse('{"items":[]}', ctx()).parseFailures, 0)
  t('items 가 빈 배열이면 커서 null', youtubeAdapter.parse('{"items":[]}', ctx()).nextCursor, null)
}

// ── 403 분류 (러너 ↔ 분류기 경계면) ───────────────────────────────
{
  // 쿼터 소진을 차단으로 세면 **정상적인 일일 한도 소진이 "차단당했다"로
  // 기록되고 소스가 꺼진다.** 다음날 아침 사람이 엉뚱한 곳을 본다.
  t(
    '쿼터 소진 403 은 quota 로 분류된다 — 소스를 끄지 않는다',
    classifyBlockedResponse(quota, youtubeAdapter.quotaMarkers),
    'quota',
  )
  // 🔴 반대로 댓글 비활성 403 은 차단으로 분류된다. 영상 하나 잘못 고르면
  //    소스 전체가 멈춘다. 이걸 쿼터로 접으면 "쿼터 소진"이라는 거짓 이유가
  //    로그에 남으므로, 분류를 바꾸지 않고 **타깃 등록 단계에서 사람이 막는다.**
  t(
    '🔴 댓글 비활성 403 은 blocked 다 — 댓글 꺼진 영상을 타깃으로 넣지 마라',
    classifyBlockedResponse(disabled, youtubeAdapter.quotaMarkers),
    'blocked',
  )
  t('표지 없는 403 은 blocked', classifyBlockedResponse('Forbidden', youtubeAdapter.quotaMarkers), 'blocked')
}

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) {
  console.log('YouTube 파서가 틀렸다. 쿼터 분류와 정렬이 걸려 있는 코드다.')
  process.exit(1)
}
console.log('YouTube 파서 정상 — 정렬·커서·쿼터 분류·작성자 미저장이 맞물린다.')
