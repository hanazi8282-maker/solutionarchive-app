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
  const specific = groups.find((g) => g.agents.some((a) => a !== '*' && a === token))
  const star = groups.find((g) => g.agents.includes('*'))
  const group = specific ?? star

  if (!group) return { allowed: true, reason: '해당하는 User-agent 그룹 없음' }

  let best: { allow: boolean; path: string } | null = null
  for (const rule of group.rules) {
    // 빈 Disallow 는 "전부 허용"을 뜻한다. 빈 문자열은 모든 경로의 접두사라
    // 거르지 않으면 항상 최단 일치로 걸린다.
    if (rule.path === '') continue
    if (!pathname.startsWith(rule.path)) continue
    if (!best || rule.path.length > best.path.length) best = rule
  }

  if (!best) return { allowed: true, reason: '일치하는 규칙 없음' }
  return {
    allowed: best.allow,
    reason: `${best.allow ? 'Allow' : 'Disallow'}: ${best.path}`,
  }
}
