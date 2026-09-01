// 소스 건강도 판정 — 조용한 실패를 막는 장치.
//
// 설계: docs/review-collection-design.md §5
//
// ⚠️ 왜 이게 이 트랙에서 가장 중요한 코드인가.
//
//    쓸 만한 소스가 다나와 하나뿐이다. 단일 소스에서 가장 비싼 고장은
//    "차단됐다"가 아니라 **"안 되는데 되는 척"** 이다. 2주 뒤에 발견하면
//    그 2주치 분석이 전부 빈 표 위에서 돌아간 것이 된다.
//
//    그래서 판정을 순수 함수로 떼어 놓고 셀프테스트로 경계를 고정한다.
//    DB 도 네트워크도 필요 없다.
//
// ⚠️ 나눗셈을 쓰지 않는다. 파싱 성공률 0.8 을 실수로 비교하면
//    부동소수점 오차 때문에 "정확히 80%"가 경계 어느 쪽으로 떨어질지가
//    입력 숫자에 따라 달라진다. 정수 교차곱으로 비교하면 그 문제가 없다.
//    (인사이트 루프의 판정 로직에서 실제로 겪은 종류의 버그다 —
//     0.02 * 0.9 가 0.018 이 아니어서 정확한 -10% 가 기각이 아닌 보류로
//     떨어졌다. 거기서는 EPS 를 넣었지만, 여기는 애초에 정수라 더 낫다.)

export type Health = 'ok' | 'degraded' | 'broken'

/** 파싱 성공률 판정을 시작하는 최소 표본. 이보다 적으면 판정을 보류한다. */
export const MIN_PARSE_SAMPLE = 10

/** 파싱 성공률 문턱 8/10 = 0.8. 정수 두 개로 두어 나눗셈을 피한다. */
export const PARSE_RATE_NUM = 8
export const PARSE_RATE_DEN = 10

/** 연속 신규 0건이 이 횟수에 도달하면 degraded. */
export const MAX_CONSECUTIVE_EMPTY = 3

export interface RunStats {
  /** 필드까지 정상적으로 읽어낸 리뷰 수. */
  reviewsParsed: number
  /** 항목은 보이는데 못 읽은 수. reviewsParsed 와 합쳐 세지 말 것. */
  parseFailures: number
  /** 지문 대조 후 실제로 새로 들어간 수. */
  newReviews: number
  /** externalId 를 못 찾아 폴백 조합으로 지문을 만든 수. */
  fallbackKeys: number
  /** 차단으로 판정된 403 / 429 횟수. 쿼터 소진은 여기 세지 않는다. */
  blockedResponses: number
  /**
   * 쿼터 소진으로 판정된 403 / 429 횟수.
   *
   * ⚠️ 이 필드가 없던 시절에는 쿼터 소진이 `blockedResponses` 로 세어졌고,
   *    그러면 **정상적인 일일 한도 소진이 "차단당했다"로 기록되고 소스가
   *    꺼졌다.** 다음날 아침 사람은 `disabled_reason: 차단 응답 403` 을 보고
   *    차단당한 줄 안다. 상태 코드만으로 성공/실패를 판정하지 말라는
   *    CLAUDE.md §7.1 이 실패 쪽에서 재발하는 형태다.
   */
  quotaExhaustedResponses: number
}

/**
 * 403/429 응답이 차단인가 쿼터 소진인가.
 *
 * ⚠️ **판단할 수 없으면 차단이다.** 표지 목록이 없거나, 본문이 비었거나,
 *    표지가 안 보이면 전부 `blocked` 다. 확인 불가를 양성으로 접지 않는다
 *    (§7.1). 두 오판의 비용이 대칭이 아니라서 그렇다 —
 *      · 차단을 쿼터로 오인 → 차단당한 소스를 계속 두드린다. 영구 차단에 가까워진다
 *      · 쿼터를 차단으로 오인 → 소스가 하루 꺼진다. 되살리는 건 UPDATE 한 줄이다
 */
export function classifyBlockedResponse(
  body: string | null | undefined,
  quotaMarkers: string[] | null | undefined,
): 'quota' | 'blocked' {
  if (!quotaMarkers || quotaMarkers.length === 0) return 'blocked'

  const text = (body ?? '').toLowerCase()
  if (!text.trim()) return 'blocked'

  for (const marker of quotaMarkers) {
    const m = marker?.trim().toLowerCase()
    if (m && text.includes(m)) return 'quota'
  }
  return 'blocked'
}

export interface HealthInput {
  stats: RunStats
  /** 이번 실행 **전까지의** 연속 신규 0건 횟수. */
  consecutiveEmptyBefore: number
}

export interface HealthVerdict {
  health: Health
  /** 사람이 읽는 한 줄 근거. 야간 보고에 그대로 실린다. */
  detail: string
  /**
   * review_sources.enabled 를 false 로 내려야 하는가.
   *
   * broken 이면 내린다. 데이터를 못 쓰는 상태에서 계속 요청하는 건
   * 순수한 낭비이고, 차단(403/429)이 원인이라면 두드릴수록 영구 차단에
   * 가까워진다. 되살리는 건 대시보드 UPDATE 한 줄이다.
   */
  disable: boolean
  /** 다음 실행에 넘길 연속 0건 횟수. */
  consecutiveEmptyAfter: number
  /**
   * 판정을 바꾸지는 않지만 사람이 봐야 할 신호.
   * health 를 흔들지 않는 이유는 §warnings 주석 참조.
   */
  warnings: string[]
}

/**
 * 판정 순서가 곧 우선순위다. 위에서 걸리면 아래는 보지 않는다.
 *
 *   1. 차단 응답(403/429) 1회라도  → broken + 즉시 중단
 *   2. 파싱 성공률 < 8/10 (표본 10 이상) → broken + 중단
 *   3. 쿼터 소진 → ok (중단하지 않고, 연속 0건도 올리지 않는다)
 *   4. 연속 신규 0건 3회 이상 → degraded (중단하지 않는다)
 *   5. 그 외 → ok
 *
 * 1이 2보다 위인 이유: 차단당하면 응답 본문이 차단 페이지라 파싱도 같이
 * 깨진다. 그때 "파서가 깨졌다"고 보고하면 사람이 엉뚱한 데를 고친다.
 * 원인을 먼저 말해야 한다.
 *
 * 3이 중단하지 않는 이유: 신규 0건은 정상일 수 있다. 그 상품에 새 리뷰가
 * 안 달린 것뿐이다. 소스를 끄면 새 리뷰가 달렸을 때 영영 못 받는다.
 * 사람에게 알리기만 한다.
 */
export function judgeHealth(input: HealthInput): HealthVerdict {
  const { stats, consecutiveEmptyBefore } = input
  const attempted = stats.reviewsParsed + stats.parseFailures

  const warnings: string[] = []

  // 지문 폴백이 절반을 넘으면 소스가 리뷰 고유번호를 더 이상 안 주는
  // 것일 수 있다. 그러면 중복 판정이 조합 키로 떨어지고 정확도가 낮아진다.
  //
  // ⚠️ 이걸로 health 를 내리지는 않는다. 폴백도 동작하는 경로이고,
  //    여기서 broken 을 띄우면 "쓸 수 있는데 꺼진" 상태가 된다.
  //    사람이 보고 파서를 고칠 신호로만 남긴다.
  if (stats.fallbackKeys * 2 > stats.reviewsParsed && stats.reviewsParsed > 0) {
    warnings.push(
      `지문 폴백 ${stats.fallbackKeys}/${stats.reviewsParsed} — 소스가 리뷰 고유번호를 안 주는지 확인 필요`,
    )
  }

  // 표본이 모자라 파싱 성공률을 판정하지 못한 경우를 조용히 넘기지 않는다.
  if (attempted > 0 && attempted < MIN_PARSE_SAMPLE && stats.parseFailures > 0) {
    warnings.push(
      `파싱 실패 ${stats.parseFailures}/${attempted} — 표본 ${MIN_PARSE_SAMPLE} 미만이라 판정 보류`,
    )
  }

  // ── 1) 차단 ────────────────────────────────────────────────
  if (stats.blockedResponses > 0) {
    return {
      health: 'broken',
      detail: `차단 응답 ${stats.blockedResponses}건(403/429) — 재시도하지 않고 소스를 중단한다`,
      disable: true,
      // 차단은 신규 0건과 다른 사건이다. 카운터를 올리면 나중에
      // "연속 0건이라 degraded" 라는 엉뚱한 이유가 남는다.
      consecutiveEmptyAfter: consecutiveEmptyBefore,
      warnings,
    }
  }

  // ── 2) 파싱 성공률 ─────────────────────────────────────────
  // parsed / attempted < 8 / 10  을 정수 교차곱으로 비교한다.
  if (
    attempted >= MIN_PARSE_SAMPLE &&
    stats.reviewsParsed * PARSE_RATE_DEN < attempted * PARSE_RATE_NUM
  ) {
    return {
      health: 'broken',
      detail: `파싱 성공 ${stats.reviewsParsed}/${attempted} (기준 ${PARSE_RATE_NUM}/${PARSE_RATE_DEN}) — 구조가 바뀐 것으로 보인다. 파서 교체 필요`,
      disable: true,
      consecutiveEmptyAfter: consecutiveEmptyBefore,
      warnings,
    }
  }

  // ── 3) 쿼터 소진 ───────────────────────────────────────────
  //
  // 정상 종료다. 소스를 끄지 않는다 — 내일 한도가 리셋되면 그대로 재개된다.
  //
  // ⚠️ 연속 0건 카운터를 올리지 않는 것이 이 분기의 핵심이다.
  //    쿼터가 소진되면 그날 신규가 0건일 수 있는데, 그걸 세면 사흘 뒤
  //    "연속 3회 신규 0건 — 증분이 끝났거나 조용히 막혔을 수 있다" 가 뜬다.
  //    **원인이 쿼터인데 증분 종료로 진단된다.** 차단을 신규 0건과 다른
  //    사건으로 다루는 것(위 1번)과 같은 이유다.
  //
  // 파싱 성공률 검사(2번)보다 아래인 이유: 러너가 403 을 받으면 파싱 전에
  // 끊으므로 쿼터 응답 본문은 parseFailures 에 안 섞인다. 즉 파싱 지표는
  // 이날 실제로 받아온 페이지들의 독립적인 신호이고, 파서가 진짜로 깨졌다면
  // 쿼터가 소진된 날에도 그 사실이 먼저 드러나야 한다.
  if (stats.quotaExhaustedResponses > 0) {
    return {
      health: 'ok',
      detail: `쿼터 소진 ${stats.quotaExhaustedResponses}건 — 오늘 몫을 다 썼다. 차단이 아니며 다음 실행에서 재개된다`,
      disable: false,
      consecutiveEmptyAfter: consecutiveEmptyBefore,
      warnings,
    }
  }

  // ── 4) 연속 신규 0건 ───────────────────────────────────────
  const emptyAfter = stats.newReviews === 0 ? consecutiveEmptyBefore + 1 : 0

  if (emptyAfter >= MAX_CONSECUTIVE_EMPTY) {
    return {
      health: 'degraded',
      detail: `연속 ${emptyAfter}회 신규 0건 — 증분이 끝났거나 조용히 막혔을 수 있다`,
      disable: false,
      consecutiveEmptyAfter: emptyAfter,
      warnings,
    }
  }

  // ── 4) 정상 ────────────────────────────────────────────────
  return {
    health: 'ok',
    detail:
      attempted === 0
        ? '수집할 타깃이 없었다'
        : `파싱 ${stats.reviewsParsed}/${attempted} · 신규 ${stats.newReviews}건`,
    disable: false,
    consecutiveEmptyAfter: emptyAfter,
    warnings,
  }
}

/**
 * 야간 보고 **최상단**에 올릴 한 줄. ok 면 null 이다.
 *
 * ⚠️ null 을 돌려주는 게 설계의 일부다. 늘 있는 줄은 곧 안 읽는 줄이 된다.
 *    경보가 없으면 줄 자체가 안 나와야 사람이 그 줄을 볼 때 실제로 읽는다.
 */
export function alertLine(sourceKey: string, v: HealthVerdict): string | null {
  if (v.health === 'ok') return null
  const icon = v.health === 'broken' ? '🚨' : '⚠️'
  const suffix = v.disable ? ' · 소스를 중단했다' : ''
  return `${icon} 소스 경보: ${sourceKey} = ${v.health} — ${v.detail}${suffix}`
}
