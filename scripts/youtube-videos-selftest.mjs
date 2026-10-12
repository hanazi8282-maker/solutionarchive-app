#!/usr/bin/env node
// YouTube 영상 제목(feat/youtube-video-titles) 셀프테스트 — 네트워크·DB·LLM 없음.
//   node scripts/youtube-videos-selftest.mjs
//
// 고정하는 것
//   1) videos.list 해석: items 없음 = null(구조 이상, "0건" 아님) · 응답에 없는 id = missing · 설명 500자 상한.
//   2) 오류 분류: 쿼터 = quota(종료 4) · 쿼터 아닌 403 = policy(종료 5) · 그 밖 = other.
//   3) 판정 프롬프트: 옵션이 없거나 비면 **기존 프롬프트와 글자 하나 다르지 않다**. 켜면 YouTube 댓글에만 제목 줄이 붙는다.
//   4) 배선: 운영 판정(relevance-judge-auto)은 옵션을 넘기지 않는다 · 측정 도구는 DB 에 쓰지 않는다.

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chunkVideoIds, classifyVideosError, parseVideosList, videoTitleLine, DESCRIPTION_HEAD_CHARS } from '../lib/review/youtube-videos.ts'
import { buildRelevancePrompt } from '../lib/analysis/relevance-judge.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
let pass = 0
let fail = 0
const t = (name, cond) => { if (cond) pass++; else { fail++; console.log(`FAIL  ${name}`) } }

// 1) 해석
const A = 'aaaaaaaaaaa'
const B = 'bbbbbbbbbbb'
t('chunk: 중복·형식 오류 제거', JSON.stringify(chunkVideoIds([A, A, 'https://youtu.be/x', ` ${B} `])) === JSON.stringify([[A, B]]))
t('chunk: 50개씩', chunkVideoIds(Array.from({ length: 51 }, (_, i) => `v${String(i).padStart(10, '0')}`)).map((c) => c.length).join() === '50,1')
const body = JSON.stringify({ items: [
  { id: A, snippet: { title: ' 리뷰 영상 ', channelTitle: '채널A', description: 'x'.repeat(900) } },
  { id: 'ccccccccccc', snippet: { title: '' } },
] })
const p = parseVideosList(body, [A, B, 'ccccccccccc'])
t('parse: 제목 있는 것만 행', p?.rows.length === 1 && p.rows[0].title === '리뷰 영상' && p.rows[0].channel === '채널A')
t('parse: 설명 500자 상한', p?.rows[0].description_head?.length === DESCRIPTION_HEAD_CHARS)
t('parse: 응답에 없거나 제목 빈 id = missing', JSON.stringify(p?.missing) === JSON.stringify([B, 'ccccccccccc']))
t('parse: items 없음 = null(구조 이상)', parseVideosList('{"kind":"x"}', [A]) === null && parseVideosList('<html>', [A]) === null)
t('parse: 빈 items = 행 0 · 전부 missing', parseVideosList('{"items":[]}', [A])?.missing[0] === A)

// 2) 오류 분류
const err = (reason) => JSON.stringify({ error: { errors: [{ reason }] } })
t('quotaExceeded 403 = quota', classifyVideosError(403, err('quotaExceeded')).kind === 'quota')
t('429 = quota', classifyVideosError(429, '').kind === 'quota')
t('forbidden 403 = policy', classifyVideosError(403, err('forbidden')).kind === 'policy')
t('본문 없는 403 = policy(reason null)', classifyVideosError(403, '').kind === 'policy' && classifyVideosError(403, '').reason === null)
t('keyInvalid 400 = other', classifyVideosError(400, err('keyInvalid')).kind === 'other')

// 3) 프롬프트
t('제목 줄 형식', videoTitleLine({ title: '제목', channel: '채널' }) === '영상 제목: 제목 (채널: 채널)')
t('제목 없으면 줄 없음', videoTitleLine({ title: '  ', channel: '채널' }) === null && videoTitleLine(undefined) === null)
const reviews = [
  { input_id: '1', text: `[YouTube 댓글 · ${A}] 이거 써봤는데 배터리가 금방 닳아요` },
  { input_id: '2', text: `[YouTube 댓글 · ${B}] 좋네요` },
  { input_id: '3', text: '다나와 리뷰 본문' },
]
const purpose = { product_elevator_pitch: '무선 이어폰' }
const base = buildRelevancePrompt(purpose, reviews, [])
const titles = new Map([[A, { title: '이어폰 리뷰', channel: '테크채널' }]])
t('옵션 없음 = 기존과 동일', buildRelevancePrompt(purpose, reviews, [], undefined).user === base.user)
t('빈 맵 = 기존과 동일', buildRelevancePrompt(purpose, reviews, [], { videoTitles: new Map() }).user === base.user)
const on = buildRelevancePrompt(purpose, reviews, [], { videoTitles: titles }).user
t('켜면 제목 있는 댓글에만 붙는다', on.includes(`R1. (영상 제목: 이어폰 리뷰 (채널: 테크채널)) [YouTube 댓글 · ${A}]`))
t('제목 모르는 영상·다른 소스는 그대로', on.includes(`R2. [YouTube 댓글 · ${B}] 좋네요`) && on.includes('R3. 다나와 리뷰 본문'))
t('system 프롬프트는 안 바뀐다', buildRelevancePrompt(purpose, reviews, [], { videoTitles: titles }).system === base.system)

// 4) 배선
const auto = readFileSync(`${ROOT}scripts/relevance-judge-auto.mjs`, 'utf8')
const measure = readFileSync(`${ROOT}scripts/youtube-title-ab-measure.mjs`, 'utf8')
const fetcher = readFileSync(`${ROOT}scripts/youtube-video-titles.mjs`, 'utf8')
t('운영 판정은 제목 옵션을 넘기지 않는다', !auto.includes('videoTitles') && !auto.includes('youtube_videos'))
t('측정 도구는 DB 에 쓰지 않는다', !/\.(upsert|insert|update|delete)\(/.test(measure))
t('측정 도구의 LLM 호출은 --run 뒤에만', measure.indexOf("args.includes('--run')") > 0 && measure.indexOf('if (!run)') < measure.indexOf('judgeRelevanceBatch(purpose'))
t('수집기는 기본 드라이런 · --apply 일 때만 upsert', fetcher.includes("args.includes('--apply')") && fetcher.indexOf('if (!apply)') < fetcher.indexOf('.upsert('))
t('수집기는 summary_line 을 덮지 않는다', !/summary_line\s*:/.test(fetcher))
t('수집기 종료코드 4(쿼터)·5(정책)', fetcher.includes('fatal(4,') && fetcher.includes('fatal(5,'))
t('수집기는 요청 URL(키 포함)을 출력하지 않는다', !/log\([^)]*\burl\b/.test(fetcher) && !/fatal\([^)]*\burl\b/.test(fetcher))

console.log(`\n${fail === 0 ? '✅' : '❌'} YouTube 영상 제목 셀프테스트: ${pass} pass / ${fail} fail`)
process.exit(fail === 0 ? 0 : 1)
