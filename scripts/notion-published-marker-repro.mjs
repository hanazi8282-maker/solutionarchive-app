#!/usr/bin/env node
// "<발행본>" 마커 분할 로직 검증 — 실제 splitPublishedMarker 를 그대로 쓴다.
// 남헌 결정: 마커 없음(미발행) / 마커 1회 / 마커 여러 번(첫 경계만 인정) 3케이스.
//
// 실행: node scripts/notion-published-marker-repro.mjs

import assert from 'node:assert/strict'
import { splitPublishedMarker } from './notion-pull-feedback.mjs'

let pass = 0

// 1) 마커 없음 — 아직 미발행. body 는 원문 그대로, published 는 NULL.
{
  const draft = '초안 본문입니다.\n\n근거 원문...'
  const { body, published } = splitPublishedMarker(draft)
  assert.equal(body, draft)
  assert.equal(published, null)
  pass++
}

// 2) 마커 1회 — 이전=초안(diff 대상), 이후=발행본.
{
  const text = '초안 본문입니다.\n\n<발행본>\n\n실제 발행한 최종 텍스트.'
  const { body, published } = splitPublishedMarker(text)
  assert.equal(body, '초안 본문입니다.\n\n')
  assert.equal(published, '실제 발행한 최종 텍스트.')
  pass++
}

// 3) 마커 여러 번 — 첫 번째만 경계. 두 번째 이후는 published 안에 그대로 남는다
//    (발행본 안에 우연히 같은 문자열이 또 나온 경우를 과설계로 처리하지 않는다).
{
  const text = '초안.\n\n<발행본>\n\n발행문 1문단.\n\n<발행본>\n\n발행문 2문단(마커 텍스트 재등장).'
  const { body, published } = splitPublishedMarker(text)
  assert.equal(body, '초안.\n\n')
  assert.equal(published, '발행문 1문단.\n\n<발행본>\n\n발행문 2문단(마커 텍스트 재등장).')
  pass++
}

// 4) 기존 동작 보존 — 마커 없을 때 diff 비교 대상(body)이 원문과 trim 기준으로 동일.
{
  const pushed = '변경 전 본문'
  const pulledNoMarker = '변경 전 본문\n'
  const { body } = splitPublishedMarker(pulledNoMarker)
  assert.equal(body.trim(), pushed.trim())
  pass++
}

console.log(`✅ notion-published-marker-repro: ${pass}/4 통과`)
