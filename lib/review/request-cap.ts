// review_sources.daily_request_cap 권장값 계산 — 순수함수만.
//
// 왜 있나: 게시판(`board:`) 타깃 1개는 실행당 최대 20요청을 먹는다(목록 1 + 글 ≤19,
// runner.ts MAX_PAGES_PER_TARGET). 글 단위(`url:`·`q:`) 타깃은 1요청이다. 그래서
// 게시판 타깃을 하나 더 등록하면 그 소스의 하루 요청 수요가 20배 단위로 뛴다.
// 그때마다 사람에게 "상한 얼마로 올려?"를 묻던 것을 없앤다(남헌 2026-09-24 지시).
//
// ⚠️ **CLAUDE.md §10.1 의 예외다.** 무인 루프는 `review_sources` 를 INSERT/UPDATE
//    하지 않는 것이 원칙이고(새 소스는 robots·ToS 판단이 들어간다), 이 기능은 남헌이
//    지정한 예외다. 예외의 범위는 셋으로 못을 박았다:
//      1) 컬럼 1개 — `daily_request_cap` 만. enabled·min_interval_ms·health 는 못 만진다.
//      2) 상한 2배 이내 — 권장값이 현재값의 2배를 넘으면 반영하지 않고 보고만 한다(`hold`).
//      3) 감사 로그 필수 — `review_source_cap_log` 에 행이 남지 않는 변경은 없다.
//         로그 테이블이 미적용이면 반영 자체를 하지 않는다(scripts/review-request-cap.mjs).
//    같은 문장이 CLAUDE.md §10.1 허용 목록에 한 줄로 있다. 두 곳이 갈라지면 CLAUDE.md 가 정본이다.
//
// ⚠️ 이 파일에는 DB·파일·시계가 없다. 전부 스크립트가 주입한 숫자로만 판단한다 —
//    그래서 셀프테스트가 DB 없이 전 경로를 돈다(runner.ts 와 같은 이유).

import { MAX_PAGES_PER_TARGET } from './runner.ts'
import { parseBoardRef } from './types.ts'

/**
 * 여유 계수. 수요를 딱 맞춰 두면 목록에 글이 하루 몰린 날 마지막 타깃이 잘린다
 * ('일일 상한 도달' — runner.ts). 30% 는 근거 있는 값이 아니라 **선택한 값**이다.
 * 바꾸려면 여기만 고친다(하드코딩 금지의 실질).
 */
export const CAP_BUFFER = 1.3

/** 게시판 타깃 1개가 한 실행에서 쓸 수 있는 최대 요청. 러너의 페이지 상한과 **같은 상수**다. */
export const REQUESTS_PER_BOARD_RUN = MAX_PAGES_PER_TARGET

/** 글 단위 타깃 1개 = 1요청. (목록을 안 읽고 글 하나만 본다) */
export const REQUESTS_PER_POST_RUN = 1

export type CapVerdict =
  /** 권장값이 현재값보다 크고 2배 이내 — 무인 실행이 스스로 반영한다. */
  | 'apply'
  /** 권장값이 현재값의 2배를 넘는다 — 반영하지 않고 사람에게 보고만 한다. */
  | 'hold'
  /** 권장값이 현재값 이하 — 내리지 않는다(아래 planSourceCap 주석). */
  | 'keep'

export type TargetKind = 'board' | 'post'

export interface SourceCapInput {
  sourceKey: string
  /** 글 단위(`url:`·`q:`·pcode 등) active 타깃 수. */
  postTargets: number
  /** 게시판 순회(`board:`) active 타깃 수. */
  boardTargets: number
  /** 지금 DB 에 들어 있는 daily_request_cap. */
  currentCap: number
}

export interface CapPlan extends SourceCapInput {
  runsPerDay: number
  /** 하루에 실제로 필요한 요청 수(여유 없음). */
  need: number
  /** 권장 상한 = ceil(need × CAP_BUFFER). */
  recommended: number
  verdict: CapVerdict
  /** 사람이 읽을 판정 사유. 감사 로그의 reason 으로 그대로 들어간다. */
  reason: string
}

/**
 * `product_ref` 가 게시판인지 글 하나인지.
 *
 * ⚠️ 알 수 없는 형식은 **글 단위로 센다**(0 이 아니다). 게시판이 아닌 것은 최소 1요청을
 *    먹고, 0 으로 세면 수요를 과소평가해 상한이 모자라진다. 과소평가는 조용히 잘리고
 *    (일일 상한 도달) 과대평가는 그냥 여유가 남을 뿐이다 — 틀릴 방향을 고른다.
 */
export function classifyTargetRef(productRef: string): TargetKind {
  return parseBoardRef(productRef ?? '') === null ? 'post' : 'board'
}

/**
 * 워크플로 YAML 의 `schedule:` 블록에 있는 `- cron:` 개수 = 하루 실행 횟수.
 *
 * **하드코딩하지 않는 이유**: 남헌 2026-09-23 지시로 수집이 하루 1회에서 2회가 됐다.
 * 코드에 2 를 적어 두면 다음에 슬롯이 늘 때 상한만 옛 수요로 남아 조용히 잘린다.
 *
 * 세 상태다(§7.1). **못 읽으면 0 이 아니라 `null`** — 호출자는 거기서 멈춘다.
 * "cron 이 없다"와 "파일을 못 읽었다"를 같은 값으로 접으면 need 가 0 이 되고
 * 판정이 전부 keep 으로 나온다(= 조용한 무동작).
 *
 * ponytail: YAML 파서를 안 쓴다(의존성 0). 대신 셀프테스트가 **실제
 * nightly-review-collect.yml 을 읽어** 개수를 대조한다 — 파싱이 틀리면 거기서 깨진다.
 * 이 방식이 모자라지면 그때 js-yaml 을 넣는다.
 */
export function countCronSchedules(yamlText: string): number | null {
  const lines = (yamlText ?? '').split(/\r?\n/)
  let sawSchedule = false
  let inSchedule = false
  let scheduleIndent = 0
  let count = 0

  for (const raw of lines) {
    const line = raw.replace(/\t/g, '  ')
    const trimmed = line.trim()
    // 주석 안의 `- cron:` 은 세지 않는다. 이 워크플로에는 설명 주석이 많고,
    // 과거에 주석으로 꺼 둔 슬롯을 세면 있지도 않은 실행을 수요에 넣는다.
    if (!trimmed || trimmed.startsWith('#')) continue

    const indent = line.length - line.trimStart().length

    if (/^schedule\s*:/.test(trimmed)) {
      sawSchedule = true
      inSchedule = true
      scheduleIndent = indent
      continue
    }
    if (!inSchedule) continue

    // 같거나 더 얕은 들여쓰기의 다른 키가 나오면 schedule 블록이 끝났다
    // (`workflow_dispatch:` 등). 그 뒤의 `- cron:` 은 이 블록 것이 아니다.
    if (indent <= scheduleIndent && !trimmed.startsWith('-')) {
      inSchedule = false
      continue
    }
    if (/^-\s*cron\s*:/.test(trimmed)) count++
  }

  if (!sawSchedule || count === 0) return null
  return count
}

/**
 * 소스 1개의 권장 상한과 판정.
 *
 * `runsPerDay` 는 양의 정수여야 한다 — `countCronSchedules` 가 `null` 을 낸 상태로
 * 여기까지 오면 계산이 아니라 **멈춰야 한다**. 그래서 던진다.
 */
export function planSourceCap(input: SourceCapInput, runsPerDay: number): CapPlan {
  if (!Number.isInteger(runsPerDay) || runsPerDay <= 0) {
    throw new Error(
      `runsPerDay 를 확인할 수 없다(${String(runsPerDay)}). 워크플로의 cron 개수를 못 읽었으면 계산하지 않는다(CLAUDE.md §7.1).`,
    )
  }

  const need =
    input.postTargets * runsPerDay * REQUESTS_PER_POST_RUN +
    input.boardTargets * runsPerDay * REQUESTS_PER_BOARD_RUN
  const recommended = Math.ceil(need * CAP_BUFFER)
  const ceiling = input.currentCap * 2

  // 판정 순서가 중요하다. keep 을 먼저 본다 — 내리는 변경은 이 기능의 범위가 아니다.
  //
  // ⚠️ **상한을 내리지 않는다.** 타깃이 일시적으로 exhausted 로 닫혔다가 되살아나는
  //    경우가 있고(20260930000006_reactivate_community_targets), 그때 상한이 이미
  //    깎여 있으면 되살린 타깃이 첫 밤부터 잘린다. 올리는 쪽만 자동으로 한다.
  if (recommended <= input.currentCap) {
    return {
      ...input,
      runsPerDay,
      need,
      recommended,
      verdict: 'keep',
      reason: `현재 상한 ${input.currentCap} 이 권장 ${recommended} 이상이다 — 그대로 둔다(내리지 않는다)`,
    }
  }
  if (recommended > ceiling) {
    return {
      ...input,
      runsPerDay,
      need,
      recommended,
      verdict: 'hold',
      reason:
        `권장 ${recommended} 이 현재 상한의 2배(${ceiling})를 넘는다 — 자동 반영 범위 밖이다. ` +
        `수요 ${need} = 글 ${input.postTargets}×${runsPerDay} + 게시판 ${input.boardTargets}×${runsPerDay}×${REQUESTS_PER_BOARD_RUN}. 사람이 판단한다`,
    }
  }
  return {
    ...input,
    runsPerDay,
    need,
    recommended,
    verdict: 'apply',
    reason:
      `수요 ${need}(글 ${input.postTargets}×${runsPerDay} + 게시판 ${input.boardTargets}×${runsPerDay}×${REQUESTS_PER_BOARD_RUN}) ` +
      `× 여유 ${CAP_BUFFER} → ${recommended}. 현재 ${input.currentCap} → 2배(${ceiling}) 이내라 반영한다`,
  }
}

export function planCaps(inputs: SourceCapInput[], runsPerDay: number): CapPlan[] {
  return inputs.map((i) => planSourceCap(i, runsPerDay))
}

const VERDICT_LABEL: Record<CapVerdict, string> = {
  apply: '반영',
  hold: '보류(사람)',
  keep: '유지',
}

/** 판정 표. 사람이 로그에서 바로 읽는 형태다 — 수치를 다 남긴다(§7.2). */
export function formatPlanTable(plans: CapPlan[]): string {
  const head = ['소스', '글', '게시판', '회/일', '수요', '권장', '현재', '판정'].join('\t')
  const rows = plans.map((p) =>
    [
      p.sourceKey,
      p.postTargets,
      p.boardTargets,
      p.runsPerDay,
      p.need,
      p.recommended,
      p.currentCap,
      VERDICT_LABEL[p.verdict],
    ].join('\t'),
  )
  return [head, ...rows].join('\n')
}
