// robots.txt 파싱과 경로 판정 (RFC 9309).
//
// ⚠️ 이 파일이 리뷰 수집 트랙의 안전장치다. 여기가 틀리면 금지된 경로를
//    긁게 되고, 영구 차단되면 파이프라인 전체가 죽는다. 그래서 순수 함수로
//    분리하고 scripts/review-robots-selftest.mjs 로 검증한다.
//
// ⚠️ 판정이 애매하면 **막는 쪽**으로 기울이지 않는다. 표준대로 판정하되,
//    호출부가 "규칙 없음"과 "허용됨"을 구분할 수 있게 reason 을 돌려준다.
//    다만 robots.txt 를 못 읽었을 때(네트워크 오류)는 호출부가 보수적으로
//    처리해야 한다 — 이 모듈은 그 판단을 하지 않는다.

/** robots.txt 의 한 그룹: User-agent 줄들 + 그에 딸린 규칙들. */
export interface RobotsGroup {
  agents: string[]
  rules: Array<{ allow: boolean; path: string }>
}

export interface RobotsVerdict {
  allowed: boolean
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
        current = { agents: [value.toLowerCase()], rules: [] }
        groups.push(current)
      }
    } else if ((field === 'disallow' || field === 'allow') && current) {
      current.rules.push({ allow: field === 'allow', path: value })
    }
  }

  return groups
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
  if (groups.length === 0) return { allowed: true, reason: 'robots.txt 에 규칙 없음' }

  const token = productToken.toLowerCase()

  // ⚠️ 같은 User-agent 에 대한 그룹이 여러 번 나오면 규칙을 **전부 합친다**
  //    (RFC 9309 §2.2.1). 첫 그룹만 쓰면 안 된다.
  //
  //    실제 사례가 있다. 화해(hwahae.co.kr)의 robots.txt 는 이렇게 생겼다:
  //
  //      User-agent: *
  //      Allow: /
  //
  //      User-agent: *
  //      Disallow: /product-information
  //      Disallow: /goods-view
  //      ...
  //
  //    첫 그룹만 보면 "전부 허용"이 되어, 사이트가 명시적으로 막은 상품·리뷰
  //    페이지를 긁게 된다. 이 버그를 실측 중에 발견했다.
  const matching = groups.filter((g) => g.agents.some((a) => a !== '*' && a === token))
  const selected = matching.length > 0 ? matching : groups.filter((g) => g.agents.includes('*'))

  if (selected.length === 0) return { allowed: true, reason: '해당하는 User-agent 그룹 없음' }

  const rules = selected.flatMap((g) => g.rules)

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

  if (!best) return { allowed: true, reason: '일치하는 규칙 없음' }
  return {
    allowed: best.allow,
    reason: `${best.allow ? 'Allow' : 'Disallow'}: ${best.path}`,
  }
}
