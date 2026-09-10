#!/usr/bin/env node
// review-hackernews-enrich.mjs 의 순수 헬퍼 셀프테스트. 네트워크·DB 없음.
//
// 여기서 고정하는 것: score 를 본문 머리에 정확히 끼우는가 · 이미 붙은 건
// 안 건드리는가(멱등) · 스토리 단위로 제대로 묶는가.

import {
  isEnriched,
  spliceStoryScore,
  groupByStory,
} from './review-hackernews-enrich.mjs'

let pass = 0
let fail = 0
const t = (name, got, want) => {
  if (Object.is(got, want)) pass++
  else {
    fail++
    console.log(`❌ ${name}\n   기대 ${JSON.stringify(want)}\n   실제 ${JSON.stringify(got)}`)
  }
}
const ok = (name, cond) => t(name, Boolean(cond), true)

const base = '[HN: Ask HN: Show your micro-SaaS · news.ycombinator.com/item?id=49590656] Working towards parity...'

// ── isEnriched ───────────────────────────────────────────────────
t('isEnriched: ▲ 없으면 false', isEnriched(base), false)
t('isEnriched: 머리에 ▲ 있으면 true', isEnriched('[HN: X · ▲24 · news.ycombinator.com/item?id=1] 본문'), true)
// 본문에 ▲ 가 있어도(사람이 쓴 화살표 등) 머리 밖이면 무시한다.
t('isEnriched: 본문의 ▲ 는 무시', isEnriched('[HN: X · news.ycombinator.com/item?id=1] 나는 ▲ 를 좋아해'), false)
t('isEnriched: null 안전', isEnriched(null), false)

// ── spliceStoryScore ─────────────────────────────────────────────
{
  const out = spliceStoryScore(base, 24)
  t('splice: score 를 URL 앞에 끼운다', out, '[HN: Ask HN: Show your micro-SaaS · ▲24 · news.ycombinator.com/item?id=49590656] Working towards parity...')
  t('splice: 본문은 그대로', out.endsWith('] Working towards parity...'), true)
  t('splice: 멱등 — 두 번 해도 한 번', spliceStoryScore(out, 24), out)
  t('splice: 멱등 — 다른 score 로도 재적용 안 함', spliceStoryScore(out, 999), out)
}
t('splice: score 가 0 이어도 붙인다', spliceStoryScore(base, 0).includes('▲0 ·'), true)
t('splice: score 가 NaN/undefined 면 원본', spliceStoryScore(base, undefined), base)
t('splice: score 가 null 이면 원본', spliceStoryScore(base, null), base)
// URL 이 없는(예전 형식) 본문은 붙일 자리가 없으니 그대로.
t('splice: 스레드 URL 없으면 원본', spliceStoryScore('[HN: 옛날 형식] 본문', 5), '[HN: 옛날 형식] 본문')
t('splice: null 안전', spliceStoryScore(null, 5), null)
// `· ` 구분자가 없는 형태(제목이 비어 바로 URL 인 경우)도 처리한다.
{
  const noSep = '[HN:  news.ycombinator.com/item?id=42] 본문'
  const out = spliceStoryScore(noSep, 7)
  ok('splice: 구분자 없어도 ▲ 를 넣는다', out.includes('▲7'))
  ok('splice: URL 은 살아 있다', /news\.ycombinator\.com\/item\?id=42\]/.test(out))
}

// ── groupByStory ─────────────────────────────────────────────────
{
  const rows = [
    { id: 'a', raw_text: '[HN: T1 · news.ycombinator.com/item?id=100] 1' },
    { id: 'b', raw_text: '[HN: T1 · news.ycombinator.com/item?id=100] 2' },
    { id: 'c', raw_text: '[HN: T2 · news.ycombinator.com/item?id=200] 3' },
    { id: 'd', raw_text: '[HN: T3 · ▲9 · news.ycombinator.com/item?id=300] 이미 붙음' },
    { id: 'e', raw_text: '[HN: 옛날 형식] URL 없음' },
  ]
  const { byStory, skipped } = groupByStory(rows)
  t('group: 스토리 2개', byStory.size, 2)
  t('group: story 100 은 2행', byStory.get('100').length, 2)
  t('group: story 200 은 1행', byStory.get('200').length, 1)
  t('group: 이미 붙음 + URL 없음 = 건너뜀 2', skipped, 2)
  ok('group: 요청 수 = 스토리 수 (댓글 수 아님)', byStory.size < rows.length)
}

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) {
  console.log('enrich 헬퍼가 틀렸다. score 를 엉뚱한 자리에 넣거나 멱등이 깨진다.')
  process.exitCode = 1
} else {
  console.log('enrich 헬퍼 정상 — score 삽입 위치·멱등·스토리 묶음 확인.')
}
