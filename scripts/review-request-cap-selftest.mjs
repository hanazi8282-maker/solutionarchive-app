#!/usr/bin/env node
// 요청 상한 자동 계산 셀프테스트 — 순수함수만. 네트워크·DB·env 없음.
//
// 지키는 것 4개. 각각 이 리포에서 실제로 난 사고 하나에 대응한다.
//
//   1) "확인 불가" 를 0 으로 접지 않는다 (CLAUDE.md §7.1)
//      워크플로에서 cron 개수를 못 읽었을 때 0 을 내면 need 가 0 이 되어 판정이
//      전부 `keep` 이 된다 = 조용한 무동작. `null` 이어야 호출자가 멈춘다.
//   2) cron 개수를 하드코딩하지 않는다
//      **실제 nightly-review-collect.yml 을 읽어** 개수를 대조한다. 파싱이 틀리면
//      여기서 깨진다(파서가 주석 속 `- cron:` 을 세는 회귀 포함).
//   3) 2배 경계를 정확히 본다
//      `apply` 와 `hold` 를 가르는 선이 예외의 범위 자체다(CLAUDE.md §10.1).
//      `=2배` 는 반영, `2배+1` 은 보류여야 한다.
//   4) 게시판 1개 = 20요청이라는 전제를 러너와 공유한다
//      상수를 따로 적어 두면 러너의 페이지 상한이 바뀔 때 수요만 옛 값으로 남는다.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MAX_PAGES_PER_TARGET } from '../lib/review/runner.ts'
import {
  CAP_BUFFER,
  REQUESTS_PER_BOARD_RUN,
  classifyTargetRef,
  countCronSchedules,
  formatPlanTable,
  planSourceCap,
} from '../lib/review/request-cap.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const WORKFLOW = path.join(here, '..', '.github', 'workflows', 'nightly-review-collect.yml')

let pass = 0
let fail = 0
const t = (name, got, want) => {
  if (Object.is(got, want)) pass++
  else {
    fail++
    console.log(`FAIL  ${name}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`)
  }
}
const ok = (name, cond) => t(name, Boolean(cond), true)

const plan = (over, runs = 2) =>
  planSourceCap({ sourceKey: 's', postTargets: 0, boardTargets: 0, currentCap: 200, ...over }, runs)

// ── 1) 글 단위 타깃만 — 1타깃 = 1요청 ────────────────────────────
{
  const p = plan({ postTargets: 5, currentCap: 200 })
  t('post만: 수요 = 5 × 2회 × 1', p.need, 10)
  t('post만: 권장 = ceil(10 × 1.3)', p.recommended, 13)
  t('post만: 여유 계수는 1.3', CAP_BUFFER, 1.3)
}

// ── 2) 게시판 타깃만 — 1타깃 = 실행당 20요청 ──────────────────────
{
  const p = plan({ boardTargets: 3, currentCap: 200 })
  t('board만: 수요 = 3 × 2회 × 20', p.need, 120)
  t('board만: 권장 = ceil(120 × 1.3)', p.recommended, 156)
  t('board만: 게시판 요청 수는 러너의 페이지 상한과 같은 상수', REQUESTS_PER_BOARD_RUN, MAX_PAGES_PER_TARGET)
}

// ── 3) 혼합 ─────────────────────────────────────────────────
{
  const p = plan({ postTargets: 4, boardTargets: 1, currentCap: 200 })
  t('혼합: 수요 = (4×2×1) + (1×2×20)', p.need, 48)
  t('혼합: 권장 = ceil(48 × 1.3) = 63', p.recommended, 63)
  t('혼합: 권장이 현재(200) 이하라 유지', p.verdict, 'keep')
}

// ── 4) 경계 — 권장이 현재의 정확히 2배면 반영한다 ──────────────────
{
  const p = plan({ boardTargets: 3, currentCap: 78 }) // 권장 156 = 78 × 2
  t('경계: 권장 156 = 현재 78 의 정확히 2배', p.recommended, 78 * 2)
  t('경계: =2배는 반영', p.verdict, 'apply')
  ok('경계: 사유에 2배 값이 적힌다', p.reason.includes('156'))
}

// ── 5) hold — 2배를 넘으면 DB 를 건드리지 않는다 ───────────────────
{
  const p = plan({ boardTargets: 3, currentCap: 77 }) // 2배 = 154 < 156
  t('hold: 2배 초과는 보류', p.verdict, 'hold')
  ok('hold: 사유에 2배 한도(154)가 적힌다', p.reason.includes('154'))
  const zero = plan({ boardTargets: 1, currentCap: 0 })
  t('hold: 현재 상한이 0 이면 어떤 권장값도 보류다(2배 = 0)', zero.verdict, 'hold')
}

// ── 6) keep — 내리지 않는다 ─────────────────────────────────────
{
  const p = plan({ postTargets: 5, currentCap: 200 })
  t('keep: 권장 13 < 현재 200 → 유지', p.verdict, 'keep')
  t('keep: 권장값 자체는 그대로 보고한다', p.recommended, 13)
  const none = plan({ currentCap: 100 })
  t('keep: active 타깃 0개면 수요 0', none.need, 0)
  t('keep: 수요 0 이어도 상한을 내리지 않는다', none.verdict, 'keep')
}

// ── 7) runsPerDay 파싱 ─────────────────────────────────────────
{
  // 실제 워크플로. 남헌 2026-09-23 지시로 하루 2회다(17:37 · 05:37 UTC).
  const real = countCronSchedules(fs.readFileSync(WORKFLOW, 'utf8'))
  t('파싱: 실제 nightly-review-collect.yml 은 하루 2회', real, 2)

  const three = `on:
  schedule:
    - cron: '37 17 * * *'
    - cron: '37 5 * * *'
    - cron: '17 11 * * *'
  workflow_dispatch:
    inputs:
      x:
        default: 'a'
`
  t('파싱: cron 3개', countCronSchedules(three), 3)

  const commented = `on:
  schedule:
    # 옛 슬롯 — 주석으로 꺼 뒀다
    # - cron: '0 18 * * *'
    - cron: '37 17 * * *'
`
  t('파싱: 주석 속 cron 은 세지 않는다', countCronSchedules(commented), 1)

  const otherBlock = `on:
  schedule:
    - cron: '37 17 * * *'
  workflow_dispatch:
jobs:
  x:
    steps:
      - run: echo "- cron: fake"
`
  t('파싱: schedule 블록 밖의 문장은 세지 않는다', countCronSchedules(otherBlock), 1)
}

// ── 8) 확인 불가 — 0 이 아니라 null, 그리고 계산은 멈춘다 ────────────
{
  t('확인불가: schedule 블록이 없으면 null', countCronSchedules('on:\n  workflow_dispatch:\n'), null)
  t('확인불가: schedule 이 있는데 cron 이 0개면 null', countCronSchedules('on:\n  schedule:\n  push:\n'), null)
  t('확인불가: 빈 문자열도 null', countCronSchedules(''), null)
  t('확인불가: 입력이 없어도 던지지 않고 null', countCronSchedules(undefined), null)

  const threw = (runs) => {
    try {
      planSourceCap({ sourceKey: 's', postTargets: 1, boardTargets: 0, currentCap: 10 }, runs)
      return false
    } catch {
      return true
    }
  }
  ok('확인불가: runsPerDay=null 이면 계산하지 않고 던진다', threw(null))
  ok('확인불가: runsPerDay=0 도 던진다(수요 0 으로 접히면 조용한 무동작이다)', threw(0))
  ok('확인불가: 소수점도 던진다', threw(1.5))
}

// ── 부속: ref 분류 · 표 출력 ────────────────────────────────────
{
  t('분류: board: 는 게시판', classifyTargetRef('board:productivity'), 'board')
  t('분류: url: 은 글 단위', classifyTargetRef('url:/articles/1564214'), 'post')
  t('분류: q: 는 글 단위', classifyTargetRef('q:notion'), 'post')
  t('분류: 다나와 pcode 도 글 단위', classifyTargetRef('12345678'), 'post')
  t('분류: 알 수 없는 형식은 글 단위로 센다(0 이 아니다)', classifyTargetRef('???'), 'post')
  t('분류: 빈 값도 던지지 않는다', classifyTargetRef(''), 'post')

  const table = formatPlanTable([plan({ boardTargets: 3, currentCap: 77 })])
  ok('표: 수요·권장·현재를 다 찍는다(§7.2)', /120/.test(table) && /156/.test(table) && /77/.test(table))
  ok('표: 판정 라벨이 한국어다', table.includes('보류'))
}

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) {
  console.log('요청 상한 계산이 틀렸다. 반영 범위(2배)와 "확인 불가" 처리를 먼저 봐라.')
  process.exit(1)
}
console.log(
  '요청 상한 계산 정상 — 게시판 1개 = 실행당 20요청으로 세고, 2배 경계는 반영·초과는 보류, cron 개수를 못 읽으면 멈춘다.',
)
