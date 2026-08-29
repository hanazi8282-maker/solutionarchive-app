#!/usr/bin/env node
// 소스 건강도 판정 셀프테스트.
//
// 단일 소스(다나와)에서 가장 비싼 고장은 "안 되는데 되는 척"이다.
// 이 판정이 틀리면 그 고장을 2주 뒤에 발견한다. 경계를 여기서 고정한다.
//
// Node 22+ 의 타입 스트리핑 덕에 .ts 를 그대로 import 한다(검증 환경: v24.16.0).

import {
  judgeHealth,
  alertLine,
  MIN_PARSE_SAMPLE,
  PARSE_RATE_NUM,
  PARSE_RATE_DEN,
  MAX_CONSECUTIVE_EMPTY,
} from '../lib/review/health.ts'

let pass = 0
let fail = 0

const t = (name, got, want) => {
  if (got === want) {
    pass++
  } else {
    fail++
    console.log(`FAIL  ${name}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`)
  }
}

/** 기본값은 "정상적으로 잘 돈 실행"이다. 테스트마다 한 축만 흔든다. */
const run = (over = {}, emptyBefore = 0) =>
  judgeHealth({
    stats: {
      reviewsParsed: 20,
      parseFailures: 0,
      newReviews: 5,
      fallbackKeys: 0,
      blockedResponses: 0,
      ...over,
    },
    consecutiveEmptyBefore: emptyBefore,
  })

// ── 정상 ──────────────────────────────────────────────────────────
t('정상 실행은 ok', run().health, 'ok')
t('정상 실행은 중단하지 않는다', run().disable, false)
t('정상 실행은 연속 0건 카운터를 초기화', run({}, 2).consecutiveEmptyAfter, 0)
t('ok 면 경보 줄이 없다', alertLine('danawa', run()), null)

// ── 1) 차단 (403/429) — 최우선 ────────────────────────────────────
t('403 한 번이면 broken', run({ blockedResponses: 1 }).health, 'broken')
t('403 이면 소스를 중단한다', run({ blockedResponses: 1 }).disable, true)
t(
  '차단이 파싱 실패보다 우선한다 — 원인을 먼저 말해야 한다',
  run({ blockedResponses: 1, reviewsParsed: 0, parseFailures: 50 }).detail.includes('차단'),
  true,
)
t(
  '차단은 연속 0건 카운터를 올리지 않는다',
  run({ blockedResponses: 1, newReviews: 0 }, 1).consecutiveEmptyAfter,
  1,
)
t(
  '차단이 degraded 조건보다 우선',
  run({ blockedResponses: 1, newReviews: 0 }, 5).health,
  'broken',
)

// ── 2) 파싱 성공률 — 경계 ─────────────────────────────────────────
// 문턱은 8/10. "미만"이 broken 이므로 정확히 0.8 은 통과해야 한다.
t('정확히 8/10 은 broken 이 아니다', run({ reviewsParsed: 8, parseFailures: 2 }).health, 'ok')
t('7/10 은 broken', run({ reviewsParsed: 7, parseFailures: 3 }).health, 'broken')
t('7/10 은 소스를 중단한다', run({ reviewsParsed: 7, parseFailures: 3 }).disable, true)
t('0/10 은 broken', run({ reviewsParsed: 0, parseFailures: 10 }).health, 'broken')

// 표본 가드 — 시도가 10 미만이면 판정하지 않는다.
t('9건 중 0건 파싱이어도 표본 부족이라 broken 아님', run({ reviewsParsed: 0, parseFailures: 9 }).health, 'ok')
t(
  '표본 부족은 조용히 넘기지 않고 경고로 남긴다',
  run({ reviewsParsed: 0, parseFailures: 9 }).warnings.length,
  1,
)
t('시도 0건(타깃 없음)은 broken 아님', run({ reviewsParsed: 0, parseFailures: 0, newReviews: 0 }).health, 'ok')
t(
  '시도 0건이면 그렇다고 말한다',
  run({ reviewsParsed: 0, parseFailures: 0, newReviews: 0 }).detail,
  '수집할 타깃이 없었다',
)

// ⚠️ 나눗셈을 안 쓰는 이유를 고정한다.
//    parsed/attempted 가 정확히 0.8 인 조합을 넓게 훑어, 어느 것도
//    broken 으로 새지 않는지 본다. 실수 비교였다면 여기서 깨진다.
{
  let leaked = 0
  for (let k = 1; k <= 200; k++) {
    const parsed = 8 * k
    const attempted = 10 * k
    const v = run({ reviewsParsed: parsed, parseFailures: attempted - parsed })
    if (v.health === 'broken') leaked++
  }
  t('정확히 80% 조합 200개가 하나도 broken 으로 새지 않는다', leaked, 0)
}

// 반대쪽도 고정 — 문턱 바로 아래는 전부 잡혀야 한다.
{
  let missed = 0
  for (let k = 1; k <= 200; k++) {
    const attempted = 10 * k
    const parsed = 8 * k - 1 // 문턱보다 딱 하나 모자람
    const v = run({ reviewsParsed: parsed, parseFailures: attempted - parsed })
    if (v.health !== 'broken') missed++
  }
  t('문턱 바로 아래 조합 200개를 전부 broken 으로 잡는다', missed, 0)
}

// ── 3) 연속 신규 0건 ──────────────────────────────────────────────
t('신규 0건 1회는 ok', run({ newReviews: 0 }, 0).health, 'ok')
t('신규 0건 2회는 ok', run({ newReviews: 0 }, 1).health, 'ok')
t('신규 0건 3회면 degraded', run({ newReviews: 0 }, 2).health, 'degraded')
t('degraded 는 소스를 중단하지 않는다', run({ newReviews: 0 }, 2).disable, false)
t('카운터가 누적된다', run({ newReviews: 0 }, 2).consecutiveEmptyAfter, 3)
t('신규가 하나라도 있으면 카운터 초기화', run({ newReviews: 1 }, 9).consecutiveEmptyAfter, 0)
t('신규가 있으면 누적돼 있어도 ok', run({ newReviews: 1 }, 9).health, 'ok')

// 파싱은 멀쩡한데 신규만 0 인 경우 — 파서 탓으로 보고하면 안 된다.
t(
  '파싱 정상 + 신규 0 은 broken 이 아니라 degraded',
  run({ reviewsParsed: 30, parseFailures: 0, newReviews: 0 }, 2).health,
  'degraded',
)

// ── 지문 폴백 경고 — health 를 흔들지 않는다 ──────────────────────
t('폴백이 과반이어도 health 는 ok', run({ reviewsParsed: 10, fallbackKeys: 9 }).health, 'ok')
t('폴백이 과반이면 경고를 남긴다', run({ reviewsParsed: 10, fallbackKeys: 9 }).warnings.length, 1)
t('폴백이 절반이면 경고 없음(과반 아님)', run({ reviewsParsed: 10, fallbackKeys: 5 }).warnings.length, 0)
t('폴백 0 이면 경고 없음', run({ reviewsParsed: 10, fallbackKeys: 0 }).warnings.length, 0)
t(
  '파싱 0건일 때 폴백 경고가 오작동하지 않는다',
  run({ reviewsParsed: 0, parseFailures: 0, newReviews: 0, fallbackKeys: 0 }).warnings.length,
  0,
)

// ── 경보 줄 ───────────────────────────────────────────────────────
{
  const broken = alertLine('danawa', run({ blockedResponses: 1 }))
  t('broken 경보에 소스명이 있다', broken.includes('danawa'), true)
  t('broken 경보에 중단 사실이 있다', broken.includes('중단'), true)
  t('broken 경보는 🚨', broken.startsWith('🚨'), true)

  const degraded = alertLine('danawa', run({ newReviews: 0 }, 2))
  t('degraded 경보는 ⚠️', degraded.startsWith('⚠️'), true)
  t('degraded 경보에는 중단 문구가 없다', degraded.includes('중단'), false)
}

// ── 상수가 설계 문서와 일치하는지 ────────────────────────────────
t('표본 문턱 10', MIN_PARSE_SAMPLE, 10)
t('성공률 문턱 8/10', `${PARSE_RATE_NUM}/${PARSE_RATE_DEN}`, '8/10')
t('연속 0건 문턱 3', MAX_CONSECUTIVE_EMPTY, 3)

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) {
  console.log('건강도 판정이 틀렸다. 이 상태로 수집을 돌리면 고장을 늦게 안다.')
  process.exit(1)
}
console.log('건강도 판정 정상 — 조용한 실패를 잡는다.')
