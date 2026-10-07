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
import { LEGACY_SLOTS } from '../lib/review/ramp.ts'
import {
  CAP_BUFFER,
  REQUESTS_PER_BOARD_RUN,
  classifyTargetRef,
  countCronSchedules,
  formatFixedSummary,
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
  planSourceCap({ sourceKey: 's', postTargets: 0, boardTargets: 0, currentCap: 200, ownerOverride: false, ...over }, runs)

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
  // v30 §2 로 cron 이 6줄이 됐지만 추가 4슬롯은 스케줄 계획 있는 소스만 돈다 — 상한 수요는 기존 2슬롯 기준(스크립트가 LEGACY_SLOTS 로 거른다).
  const realText = fs.readFileSync(WORKFLOW, 'utf8')
  t('파싱: 실제 nightly-review-collect.yml 은 기존 슬롯 하루 2회', countCronSchedules(realText, (c) => LEGACY_SLOTS.has(c)), 2)
  t('파싱: 실제 nightly-review-collect.yml cron 전체 6줄', countCronSchedules(realText), 6)
  t('스크립트가 기존 슬롯만 센다', /countCronSchedules\([^)]*\), \(c\) => LEGACY_SLOTS\.has\(c\)\)/.test(fs.readFileSync(path.join(path.dirname(WORKFLOW), '..', '..', 'scripts', 'review-request-cap.mjs'), 'utf8')), true)

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

// ── 9) 소유자 예외 소스 — 자동 상향하지 않는다 (남헌 2026-10-06) ──────────
//   googleplay 40/일·appstore 200/일은 사람이 정한 값이다. 수요가 아무리 커도 apply 로 나오면 안 된다.
{
  // 일반 소스면 apply 가 나올 조건(권장 156 ≤ 2배 160)
  const normal = plan({ sourceKey: 'clien', boardTargets: 3, currentCap: 80 })
  t('예외: 일반 소스는 기존대로 2배 이내 상향', normal.verdict, 'apply')
  ok('예외: 일반 소스 상향폭은 2배 이내', normal.recommended <= 80 * 2 && normal.recommended > 80)

  const gp = plan({ sourceKey: 'googleplay', boardTargets: 3, currentCap: 80, ownerOverride: true })
  t('예외: override 있는 소스는 같은 수요여도 고정', gp.verdict, 'fixed')
  t('예외: 권장값은 계산해 보고한다', gp.recommended, 156)
  const gpKeep = plan({ sourceKey: 'googleplay', postTargets: 1, currentCap: 40, ownerOverride: true })
  t('예외: 수요가 작아도 고정(keep 아님)', gpKeep.verdict, 'fixed')
  const gpHold = plan({ sourceKey: 'appstore', boardTargets: 50, currentCap: 200, ownerOverride: true })
  t('예외: 2배 초과 수요여도 고정(hold 로 로그에 안 섞임)', gpHold.verdict, 'fixed')

  // override 읽기 실패 = null. "예외 없음" 으로 접으면 googleplay 가 오른다.
  const unknown = [
    plan({ sourceKey: 'clien', boardTargets: 3, currentCap: 80, ownerOverride: null }),
    plan({ sourceKey: 'googleplay', boardTargets: 3, currentCap: 80, ownerOverride: null }),
  ]
  t('확인불가: override 못 읽으면 상향 0건', unknown.filter((p) => p.verdict === 'apply').length, 0)
  ok('확인불가: 전부 fixed', unknown.every((p) => p.verdict === 'fixed'))
  const missing = planSourceCap({ sourceKey: 'x', postTargets: 0, boardTargets: 3, currentCap: 80 }, 2)
  t('확인불가: ownerOverride 누락도 fixed(명시 false 만 상향)', missing.verdict, 'fixed')

  const line = formatFixedSummary([normal, gp, gpHold])
  ok('요약: 소유자 예외 소스 N곳 제외 문구', line?.includes('소유자 예외 소스 2곳 제외(상한 고정)'))
  ok('요약: 소스 이름이 찍힌다', line?.includes('googleplay') && line?.includes('appstore'))
  ok('요약: 일반 소스는 안 찍힌다', !line?.includes('clien'))
  ok('요약: 확인 불가는 따로 찍는다', formatFixedSummary(unknown)?.includes('override 확인 불가 2곳'))
  t('요약: 고정이 없으면 null', formatFixedSummary([normal]), null)
  ok('표: 고정 라벨', formatPlanTable([gp]).includes('고정'))
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
