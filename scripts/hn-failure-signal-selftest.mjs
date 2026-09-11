#!/usr/bin/env node
// lib/review/failure-signal.ts 셀프테스트. 네트워크·DB·파일쓰기 없음.
//
// 고정하는 것: 강한 다단어 구문만 걸리는가(단일 단어로는 절대 안 걸림) ·
// 표기 흔들림(대소문자·굽은 따옴표·하이픈)을 흡수하는가 · 이미 기록된
// object_id 를 중복 append 하지 않는가 · 발췌가 상한을 지키는가.

import { htmlStrip } from '../lib/review/adapters/hackernews.ts'
import {
  EXCERPT_LIMIT,
  FAILURE_PHRASES,
  candidateFromHit,
  detectFailureSignals,
  excerpt,
  existingObjectIds,
  formatCandidateBlock,
  hnItemUrl,
  normalize,
  selectNewCandidates,
} from '../lib/review/failure-signal.ts'

let pass = 0
let fail = 0
const t = (name, got, want) => {
  if (Object.is(got, want)) pass++
  else { fail++; console.log(`❌ ${name}\n   기대 ${JSON.stringify(want)}\n   실제 ${JSON.stringify(got)}`) }
}
const ok = (name, cond) => t(name, Boolean(cond), true)

// ── 구문 목록 자체의 규약 ─────────────────────────────────────────
ok('구문: 전부 다단어다 (단일 단어 금지)', FAILURE_PHRASES.every((p) => p.trim().includes(' ')))

// ── detectFailureSignals: 양성 ───────────────────────────────────
{
  const r = detectFailureSignals('After two years we shut down the service and moved on.')
  ok('양성: "we shut down" 탐지', r.includes('we shut down'))
}
{
  const r = detectFailureSignals('We never found product market fit, so we gave up on it.')
  ok('양성: 한 글에서 두 구문 동시 탐지', r.length >= 2)
  ok('양성: "gave up on" 포함', r.includes('gave up on'))
}
{
  // 하이픈 표기 흔들림 — 본문은 하이픈 없이, 구문은 하이픈 있게 정의돼 있다.
  const r = detectFailureSignals('there was simply no product market fit for it')
  ok('양성: 하이픈 없는 표기도 탐지', r.includes('no product-market fit'))
}
{
  // 굽은 따옴표(’) — 실제 HN 본문에 흔하다.
  const r = detectFailureSignals('It just didn’t work out for us.')
  ok('양성: 굽은 따옴표 표기 탐지', r.includes("didn't work out"))
}
{
  const r = detectFailureSignals('WE SHUT DOWN the beta last March.')
  ok('양성: 대문자 표기 탐지', r.includes('we shut down'))
}
{
  // 줄바꿈·연속 공백이 구문 사이에 끼어도 정규화가 흡수한다.
  const r = detectFailureSignals('we\n  shut   down the product line')
  ok('양성: 줄바꿈·연속공백 흡수', r.includes('we shut down'))
}

// ── detectFailureSignals: 음성 (범용어 오염 방지) ─────────────────
t('음성: 중립 텍스트 → 0건', detectFailureSignals('This library is great, we use it in production.').length, 0)
t('음성: "failed" 단일 단어로는 안 걸린다', detectFailureSignals('the build failed again on CI').length, 0)
t('음성: "shut" 단일 단어로는 안 걸린다', detectFailureSignals('shut the laptop and went home').length, 0)
t('음성: "gave up" 만으로는 안 걸린다', detectFailureSignals('I gave up halfway through the tutorial').length, 0)
t('음성: 빈 문자열 → 0건', detectFailureSignals('').length, 0)
t('음성: null → 0건', detectFailureSignals(null).length, 0)

// ── normalize ────────────────────────────────────────────────────
t('정규화: 하이픈은 공백이 된다', normalize('product-market fit'), 'product market fit')
t('정규화: 굽은 따옴표는 곧은 것으로', normalize('didn’t'), "didn't")
t('정규화: 연속 공백 접힘', normalize('we   shut\n\ndown'), 'we shut down')

// ── excerpt ──────────────────────────────────────────────────────
{
  const long = 'x'.repeat(EXCERPT_LIMIT + 200)
  const e = excerpt(long)
  ok('발췌: 상한을 넘지 않는다', e.length <= EXCERPT_LIMIT + 1)
  ok('발췌: 잘렸으면 말줄임', e.endsWith('…'))
}
t('발췌: 짧으면 그대로', excerpt('short one'), 'short one')

// ── existingObjectIds / selectNewCandidates (중복 방지) ───────────
{
  const md = ['# 대기열', '', '## HN 12345', '', '- 매칭: `we shut down`', '', '> 본문 4242 숫자 포함', '', '## HN 67890', ''].join('\n')
  const ids = existingObjectIds(md)
  ok('중복: 기록된 id 를 읽는다', ids.has('12345') && ids.has('67890'))
  t('중복: 본문 속 숫자는 id 로 안 읽는다', ids.has('4242'), false)
  t('중복: 개수', ids.size, 2)
}
{
  const md = '## HN 12345\n'
  const cands = [
    { objectId: '12345', phrases: ['we failed'], excerpt: 'a', url: hnItemUrl('12345'), context: 'q:x' },
    { objectId: '99999', phrases: ['we failed'], excerpt: 'b', url: hnItemUrl('99999'), context: 'q:x' },
  ]
  const fresh = selectNewCandidates(existingObjectIds(md), cands)
  t('중복: 이미 있는 건 빠진다', fresh.length, 1)
  t('중복: 남은 건 신규', fresh[0].objectId, '99999')
}
{
  // 같은 배치 안 중복도 한 번만.
  const c = { objectId: '777', phrases: ['we failed'], excerpt: 'a', url: hnItemUrl('777'), context: 'q:x' }
  t('중복: 배치 내 중복도 1건으로', selectNewCandidates(new Set(), [c, { ...c }]).length, 1)
}

// ── candidateFromHit (Algolia hit 모양 그대로) ────────────────────
{
  const hit = {
    objectID: '40123456',
    comment_text: '<p>We built it for 18 months and then <i>we shut down</i> the product.</p>',
    story_title: 'Show HN: My failed startup',
    author: 'someone',
    created_at: '2024-03-14T09:00:00.000Z',
  }
  const c = candidateFromHit(hit, 'q:project management', htmlStrip)
  ok('hit: 후보로 변환된다', c !== null)
  t('hit: object_id', c.objectId, '40123456')
  ok('hit: 구문 탐지', c.phrases.includes('we shut down'))
  t('hit: HN 원본 URL', c.url, 'https://news.ycombinator.com/item?id=40123456')
  t('hit: 검색 맥락 보존', c.context, 'q:project management')
  ok('hit: HTML 태그가 벗겨진다', !c.excerpt.includes('<p>') && !c.excerpt.includes('<i>'))
  t('hit: 작성일 YYYY-MM-DD', c.createdAt, '2024-03-14')
}
t('hit: 실패신호 없으면 null', candidateFromHit({ objectID: '1', comment_text: '<p>nice tool</p>' }, 'q:x', htmlStrip), null)
t('hit: 본문 없으면 null', candidateFromHit({ objectID: '1', comment_text: '' }, 'q:x', htmlStrip), null)
t('hit: objectID 없으면 null', candidateFromHit({ comment_text: 'we shut down' }, 'q:x', htmlStrip), null)

// ── formatCandidateBlock ─────────────────────────────────────────
{
  const block = formatCandidateBlock({
    objectId: '40123456',
    phrases: ['we shut down', 'we failed'],
    excerpt: 'We built it and then we shut down.',
    url: hnItemUrl('40123456'),
    context: 'q:notion',
    storyTitle: 'Show HN: thing',
    author: 'someone',
    createdAt: '2024-03-14',
  })
  ok('블록: 머리글이 중복 판정 형식과 같다', existingObjectIds(block).has('40123456'))
  ok('블록: 매칭 구문 포함', block.includes('we shut down') && block.includes('we failed'))
  ok('블록: 원본 URL 포함', block.includes('https://news.ycombinator.com/item?id=40123456'))
  ok('블록: 검색 맥락 포함', block.includes('q:notion'))
  ok('블록: 발췌 인용', block.includes('> We built it'))
}

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) { console.log('실패신호 탐지가 틀렸다.'); process.exitCode = 1 }
else console.log('실패신호 탐지 정상 — 다단어 구문만 · 표기 흔들림 흡수 · 중복 append 방지.')
