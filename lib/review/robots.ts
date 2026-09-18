// robots.txt 파싱과 경로 판정 (RFC 9309).
//
// ⚠️ 이 파일이 리뷰 수집 트랙의 안전장치다. 여기가 틀리면 금지된 경로를
//    긁게 되고, 영구 차단되면 파이프라인 전체가 죽는다. 그래서 순수 함수로
//    분리하고 scripts/review-robots-selftest.mjs 로 검증한다.
//
// ⚠️ 판정은 **3상태**다 (CLAUDE.md §7.1 / _principles.md §1).
//
//      allowed    — 규칙을 읽었고, 우리 UA 에 적용되는 그룹이 있고, 그 규칙이 이 경로를 허용한다
//      disallowed — 읽었고 규칙이 막는다
//      unverified — 규칙을 확인하지 못했다. 파일이 비었거나, 그룹이 하나도 없거나,
//                   우리 UA 에 적용되는 그룹이 없는 경우다
//
//    2026-09-18 까지 이 모듈은 `allowed: boolean` 2상태였고, "규칙을 못 읽었다"를
//    전부 `allowed: true` 로 접었다. 그래서 robots.txt 자리에 온 404/403 HTML 이
//    "규칙 0개 = 전체 허용"으로 통과했다(킥스타터 403 · tistory 404 · 클리앙 SP-027).
//    **막아야 할 것을 조용히 통과시키는 방향의 결함이라 3상태로 갈랐다.**
//
//    `unverified` 를 어떻게 처리할지는 호출부가 정한다 — 러너는 요청을 보내지
//    않는다(fail-closed). 이 모듈은 상태와 사유만 돌려준다.

/**
 * robots.txt 의 한 그룹: User-agent 줄들 + 그에 딸린 규칙들 + Crawl-delay.
 *
 * `crawlDelay` 는 초 단위(robots.txt 원문 단위 그대로). 선언이 없으면 null 이다.
 * **0 과 null 을 구분한다** — `Crawl-delay: 0` 은 "간격 없음"을 명시한 것이고
 * null 은 "아무 말도 없다"다.
 */
export interface RobotsGroup {
  agents: string[]
  rules: Array<{ allow: boolean; path: string }>
  crawlDelay: number | null
}

export type RobotsState = 'allowed' | 'disallowed' | 'unverified'

export interface RobotsVerdict {
  state: RobotsState
  reason: string
}

/**
 * robots.txt 를 그룹 배열로 파싱한다.
 *
 * 연속된 User-agent 줄은 하나의 그룹을 공유한다(표준). 규칙이 한 번이라도
 * 나온 뒤의 User-agent 줄은 새 그룹의 시작이다 — 이걸 안 지키면
 * `User-agent: a` / `User-agent: b` / `Disallow: /x` / `User-agent: *`
 * 에서 `*` 가 앞 그룹에 흡수돼 전혀 다른 규칙을 적용받는다.
 */
export function parseRobots(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = []
  let current: RobotsGroup | null = null

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim()
    if (!line) continue

    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line)
    if (!m) continue

    const field = m[1].toLowerCase()
    const value = m[2].trim()

    if (field === 'user-agent') {
      if (current && current.rules.length === 0) {
        current.agents.push(value.toLowerCase())
      } else {
        current = { agents: [value.toLowerCase()], rules: [], crawlDelay: null }
        groups.push(current)
      }
    } else if ((field === 'disallow' || field === 'allow') && current) {
      current.rules.push({ allow: field === 'allow', path: value })
    } else if (field === 'crawl-delay' && current) {
      // ⚠️ Crawl-delay 는 **규칙이 아니다.** rules 에 넣으면 경로 매칭 대상이 되어
      //    엉뚱한 경로를 막는다. 그룹 속성으로 따로 둔다.
      //    또 rules 를 건드리지 않으므로 연속 User-agent 줄의 그룹 병합도 깨지 않는다
      //    (brunch robots 는 Crawl-delay 가 각 그룹 끝에 온다).
      const n = Number(value)
      if (Number.isFinite(n) && n >= 0) current.crawlDelay = n
    }
  }

  return groups
}

/**
 * 이 응답 본문이 robots.txt 가 아니라 **마크업**(에러 페이지·챌린지 화면)인가.
 *
 * ⚠️ 이게 필요한 이유: 서버가 robots.txt 자리에 HTML 을 주는 경우가 흔하다.
 *    킥스타터는 403(Cloudflare 챌린지 HTML), `www.tistory.com` 은 404 HTML,
 *    theqoo·todayhumor·clien 은 404 HTML 이다(전부 2026-09-16~18 실측).
 *    그 HTML 을 `parseRobots` 에 넣으면 `field: value` 줄이 없어 규칙 0개가 되고,
 *    2상태 시절에는 그게 곧 "전체 허용"이었다.
 *
 *    상태 코드만으로는 못 잡는다 — **200 에 HTML 을 주는 소프트 404** 가 있고,
 *    그때는 상태도 200, 규칙도 0개다. 그래서 본문 자체를 본다(CLAUDE.md §7.1:
 *    상태 코드로 성공을 판정하지 마라).
 *
 * 판정은 둘 중 하나라도 걸리면 마크업이다:
 *   (1) 주석·빈 줄을 뺀 **첫 의미 있는 줄**이 `<` 로 시작한다.
 *   (2) 앞 4KB 안에 `<!doctype html` 또는 `<html` 이 있다 — HTML 안에 우연히
 *       `User-agent: *` 문자열이 들어 있어 (1)을 빠져나가는 경우를 잡는다.
 *
 * 빈 본문은 마크업이 아니다(false). "규칙이 없다"는 판정은 robotsVerdict 가
 * `unverified` 로 따로 낸다 — 여기서 겹쳐 세지 않는다.
 */
export function looksLikeMarkup(text: string): boolean {
  if (/<!doctype\s+html|<html[\s>]/i.test(text.slice(0, 4096))) return true

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^﻿/, '').trim()
    if (!line || line.startsWith('#')) continue
    return line.startsWith('<')
  }
  return false
}

/**
 * 규칙 경로가 이 pathname 에 매칭되는가 (RFC 9309 §2.2.2).
 *
 * - `*` 는 길이 0 이상의 임의 문자열.
 * - `$` 는 **패턴 끝에서만** 특수문자로, "경로가 여기서 끝나야 함"을 뜻한다.
 *   중간의 `$` 는 리터럴이다.
 * - 그 외 문자는 전부 리터럴. 경로에 흔히 들어가는 `.` `?` `+` 가 정규식
 *   메타문자로 새면 `Disallow: /api/v1?query=` 같은 규칙이 엉뚱한 경로를 막는다.
 *
 * 와일드카드도 앵커도 없는 규칙은 예전과 동일하게 순수 접두사 비교를 탄다
 * (지금 다나와·앱스토어 규칙이 전부 이 형태다).
 */
function pathMatches(pattern: string, pathname: string): boolean {
  const anchored = pattern.endsWith('$')
  const body = anchored ? pattern.slice(0, -1) : pattern

  if (!body.includes('*')) {
    return anchored ? pathname === body : pathname.startsWith(body)
  }

  // 투포인터 글롭 매처. 정규식 백트래킹이 없어 악성 robots.txt 로도 선형 시간이다
  // (연속 `*` 나 `/a*a*a*…` 를 제3자 사이트가 robots.txt 에 심어 nightly 수집기를
  //  멈추게 하는 ReDoS 를 실측으로 확인했다 — 그래서 정규식을 버렸다).
  // `*` = 길이 0 이상 임의 문자열, 그 외 문자는 전부 리터럴(대소문자 구분).
  let p = 0 // pathname 커서
  let b = 0 // body 커서
  let star = -1 // 마지막으로 지나온 `*` 의 body 위치
  let mark = 0 // 그 `*` 가 소비하기 시작한 pathname 위치
  while (p < pathname.length) {
    if (b === body.length) {
      if (!anchored) return true // body 소진 + 앵커 없음 = 접두사 매치 성공
      if (star === -1) return false
      b = star + 1
      p = ++mark
    } else if (body[b] === '*') {
      star = b++
      mark = p
    } else if (body[b] === pathname[p]) {
      b++
      p++
    } else if (star !== -1) {
      b = star + 1
      p = ++mark
    } else {
      return false
    }
  }
  while (b < body.length && body[b] === '*') b++
  return b === body.length // 앵커 유무 무관: pathname 을 다 썼으니 body 도 다 써야 매치
}

/**
 * 우리 UA 에 적용되는 그룹들. 없으면 빈 배열이다.
 *
 * ⚠️ 같은 User-agent 에 대한 그룹이 여러 번 나오면 **전부 합친다**
 *    (RFC 9309 §2.2.1). 첫 그룹만 쓰면 안 된다.
 *
 *    실제 사례가 있다. 화해(hwahae.co.kr)의 robots.txt 는 이렇게 생겼다:
 *
 *      User-agent: *
 *      Allow: /
 *
 *      User-agent: *
 *      Disallow: /product-information
 *      Disallow: /goods-view
 *      ...
 *
 *    첫 그룹만 보면 "전부 허용"이 되어, 사이트가 명시적으로 막은 상품·리뷰
 *    페이지를 긁게 된다. 이 버그를 실측 중에 발견했다.
 *
 * ⚠️ 경로 판정(robotsVerdict)과 Crawl-delay(robotsCrawlDelaySec)가 **이 함수
 *    하나를 공유한다.** 둘이 각자 그룹을 고르면 "규칙은 A 그룹, 간격은 B 그룹"
 *    처럼 갈라진다.
 */
function selectGroups(groups: RobotsGroup[], productToken: string): RobotsGroup[] {
  const token = productToken.toLowerCase()
  const matching = groups.filter((g) => g.agents.some((a) => a !== '*' && a === token))
  return matching.length > 0 ? matching : groups.filter((g) => g.agents.includes('*'))
}

/**
 * 우리 UA 에 적용되는 Crawl-delay(초). 선언이 없으면 null.
 *
 * ⚠️ 여러 그룹이 합쳐질 때는 **가장 큰 값**을 쓴다. 사이트가 한 곳에서 5초라고
 *    했으면 다른 곳의 1초로 덮으면 안 된다.
 *
 * ⚠️ 2026-09-18 까지 이 파서가 아예 없었다. robots 가 `Crawl-delay: N` 을
 *    선언해도 러너는 그 줄을 못 읽었고, 유일한 방어선이
 *    `review_sources.min_interval_ms` 의 **사람이 손으로 넣은 값**이었다.
 *    brunch 가 그 경우다(`Crawl-delay: 5` ↔ min_interval 5000 을 손으로 맞춤).
 *    다음 소스에서 그 손질을 빠뜨리면 그대로 robots 위반이 된다 — 그래서
 *    기계가 읽는다. 쓰는 쪽은 `runner.ts` 의 Pacer 이고 **DB 값과 큰 쪽**을 쓴다.
 */
export function robotsCrawlDelaySec(groups: RobotsGroup[], productToken: string): number | null {
  let max: number | null = null
  for (const g of selectGroups(groups, productToken)) {
    if (g.crawlDelay === null) continue
    if (max === null || g.crawlDelay > max) max = g.crawlDelay
  }
  return max
}

/**
 * 이 경로를 가져가도 되는가.
 *
 * @param productToken 우리 크롤러의 제품 토큰. robots.txt 의 User-agent 값과
 *   **정확히 일치**할 때만 그 그룹이 적용된다. 부분 문자열 매칭을 쓰면
 *   `User-agent: a` 같은 짧은 토큰이 우리 UA 안에 우연히 포함돼 남의 규칙을
 *   뒤집어쓴다. 이 스크립트의 첫 버전이 실제로 그 버그를 갖고 있었다.
 *
 * 최장 일치 규칙을 적용한다. `Disallow: /search` 와 `Allow: /search/public` 이
 * 함께 있을 때 짧은 쪽만 보면 허용된 경로까지 못 가게 된다.
 */
export function robotsVerdict(
  groups: RobotsGroup[],
  pathname: string,
  productToken: string,
): RobotsVerdict {
  // ⚠️ 그룹이 0개다 = 이 본문에서 아무 규칙도 못 읽었다. **허용이 아니다.**
  //    빈 파일일 수도, HTML 을 robots 로 읽은 것일 수도, 파싱이 실패한 것일
  //    수도 있는데 그 셋을 구분할 재료가 없다. 구분할 수 없으면 확인 불가다.
  if (groups.length === 0) {
    return { state: 'unverified', reason: 'robots.txt 에서 그룹을 하나도 읽지 못했다' }
  }

  const selected = selectGroups(groups, productToken)

  // ⚠️ 우리 UA 에 적용되는 그룹이 없다 = **확인 불가다.** 2026-09-18 까지 여기서
  //    `allowed: true` 를 돌려줬다. `goodchoice.kr` 이 실측 반례다 — robots.txt 는
  //    200 인데 `User-agent: *` 그룹이 아예 없어(특정 봇 그룹만 있다) 파서가
  //    "해당 그룹 없음 → 허용"을 냈다. 사이트가 우리에 대해 아무 말도 하지
  //    않은 것을 "가도 된다"로 읽은 것이다.
  if (selected.length === 0) {
    return { state: 'unverified', reason: '우리 UA 에 적용되는 User-agent 그룹이 없다' }
  }

  const rules = selected.flatMap((g) => g.rules)

  // `*` 그룹은 있는데 규칙이 0개인 경우(velog 57B · docs.github.com 13B 실측).
  //
  // ⚠️ 이건 **허용으로 판정한다** — RFC 9309 §2.2.2 대로 빈 그룹은 제약을 걸지
  //    않는다. 다만 사유를 따로 낸다. "금지하지 않았다"와 "허용한다"는 다른
  //    말이고, 그 구분이 사유 문장에서 사라지면 다음 사람이 "robots 가 허용해
  //    줬다"를 채택 근거로 쓴다. 실제로 velog 는 robots 가 아니라 **이용약관**이
  //    채택 근거다(lib/review/adapters/velog.ts 헤더).
  if (rules.length === 0) {
    return {
      state: 'allowed',
      reason: '적용 그룹에 규칙이 0개 — 금지하지 않았을 뿐 초대는 아니다',
    }
  }

  let best: { allow: boolean; path: string } | null = null
  for (const rule of rules) {
    // 빈 Disallow 는 "전부 허용"을 뜻한다. 빈 문자열은 모든 경로의 접두사라
    // 거르지 않으면 항상 최단 일치로 걸린다.
    if (rule.path === '') continue
    if (!pathMatches(rule.path, pathname)) continue
    // 우선순위 기준은 **패턴 원문 길이**다. 와일드카드를 뺀 리터럴 수 같은 다른
    // 정밀도 산정으로 바꾸지 마라 — 표준이 강제하는 알고리즘이 없고, 이 기준으로
    // 화해 버그를 잡은 전례가 있다(위 주석).
    if (!best || rule.path.length > best.path.length) best = rule
  }

  if (!best) return { state: 'allowed', reason: '일치하는 규칙 없음' }
  return {
    state: best.allow ? 'allowed' : 'disallowed',
    reason: `${best.allow ? 'Allow' : 'Disallow'}: ${best.path}`,
  }
}
