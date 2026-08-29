#!/usr/bin/env node
// robots.txt 판정 셀프테스트.
//
// 이 판정이 리뷰 수집 트랙에서 차단을 막는 유일한 안전장치다. 틀리면
// 금지된 경로를 긁고, 영구 차단되면 파이프라인 전체가 죽는다.
//
// Node 22+ 의 타입 스트리핑 덕에 .ts 를 그대로 import 한다(검증 환경: v24.16.0).

import { parseRobots, robotsVerdict } from '../lib/review/robots.ts'

const TOKEN = 'solutionarchive-review-probe'

let pass = 0
let fail = 0

const t = (name, got, want) => {
  if (got === want) {
    pass++
  } else {
    fail++
    console.log(`FAIL  ${name}\n      got=${got} want=${want}`)
  }
}

const allowed = (txt, path) => robotsVerdict(parseRobots(txt), path, TOKEN).allowed

// ── 최장 일치 ─────────────────────────────────────────────────────
const longest = 'User-agent: *\nDisallow: /search\nAllow: /search/public\n'
t('최장 일치 — 더 긴 Allow 가 이긴다', allowed(longest, '/search/public/x'), true)
t('최장 일치 — 나머지는 Disallow 유지', allowed(longest, '/search/private'), false)
t('규칙과 무관한 경로는 허용', allowed(longest, '/products/1'), true)
t('경계 — Disallow 경로 자체', allowed(longest, '/search'), false)

// ── 전체 금지 / 전체 허용 ─────────────────────────────────────────
t('Disallow: / 는 전체 금지', allowed('User-agent: *\nDisallow: /\n', '/anything'), false)
t('빈 Disallow 는 전부 허용', allowed('User-agent: *\nDisallow:\n', '/anything'), true)
t('Allow: / 만 있으면 허용', allowed('User-agent: *\nAllow: /\n', '/anything'), true)
t('robots.txt 가 비면 허용', allowed('', '/x'), true)

// ── User-agent 그룹 선택 ──────────────────────────────────────────
const otherBot = 'User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nAllow: /\n'
t('다른 봇 그룹은 우리에게 적용 안 됨', allowed(otherBot, '/x'), true)

// 이게 첫 버전의 실제 버그다. UA.includes(agent) 로 매칭하면 'a' 가
// 'solutionarchive-review-probe' 안에 들어 있어 남의 그룹을 뒤집어쓴다.
const shortToken = 'User-agent: a\nUser-agent: b\nDisallow: /x\nUser-agent: *\nDisallow: /y\n'
t('짧은 토큰이 우리 UA 에 우연히 포함돼도 무시', allowed(shortToken, '/x'), true)
t('연속 User-agent 뒤의 새 그룹이 * 로 제대로 분리됨', allowed(shortToken, '/y'), false)

const exact = `User-agent: ${TOKEN}\nDisallow: /private\n\nUser-agent: *\nDisallow: /\n`
t('제품 토큰 정확 일치 시 그 그룹을 쓴다 — 허용 경로', allowed(exact, '/public'), true)
t('제품 토큰 정확 일치 시 그 그룹을 쓴다 — 금지 경로', allowed(exact, '/private/x'), false)

const caseTest = `User-agent: ${TOKEN.toUpperCase()}\nDisallow: /nope\n\nUser-agent: *\nAllow: /\n`
t('User-agent 대소문자 무시', allowed(caseTest, '/nope'), false)

// ── 같은 UA 그룹이 여러 번 나오는 경우 (RFC 9309 §2.2.1: 합쳐야 한다) ──
// 실측에서 발견한 실제 사례다. 화해(hwahae.co.kr)가 이 형태이고, 첫 그룹만
// 보면 "전부 허용"이 되어 사이트가 명시적으로 막은 상품·리뷰 페이지를 긁는다.
const split = [
  'User-agent: *',
  'Allow: /',
  '',
  'User-agent: *',
  'Disallow: /product-information',
  'Disallow: /goods-view',
  '',
].join('\n')
t('갈라진 * 그룹 병합 — 뒤 그룹의 Disallow 가 살아난다', allowed(split, '/product-information'), false)
t('갈라진 * 그룹 병합 — 두 번째 Disallow 도 살아난다', allowed(split, '/goods-view/1'), false)
t('갈라진 * 그룹 병합 — 막지 않은 경로는 그대로 허용', allowed(split, '/awards/home'), true)

const splitSpecific = [
  `User-agent: ${TOKEN}`,
  'Allow: /',
  '',
  `User-agent: ${TOKEN}`,
  'Disallow: /nope',
  '',
  'User-agent: *',
  'Disallow: /',
].join('\n')
t('제품 토큰 그룹도 여러 개면 병합', allowed(splitSpecific, '/nope'), false)
t('제품 토큰 그룹 병합 시 * 그룹은 무시', allowed(splitSpecific, '/yes'), true)

// ── 파싱 잡항목 ───────────────────────────────────────────────────
t('주석 제거', allowed('# hi\nUser-agent: *   # inline\nDisallow: /admin\n', '/admin/1'), false)
t('CRLF 줄바꿈', allowed('User-agent: *\r\nDisallow: /a\r\n', '/a/b'), false)
t('필드명 대소문자 무시', allowed('USER-AGENT: *\nDISALLOW: /a\n', '/a'), false)
t('공백 여유', allowed('User-agent:    *   \nDisallow:   /a   \n', '/a'), false)
t('규칙 앞에 User-agent 가 없으면 무시', allowed('Disallow: /a\n', '/a'), true)
t('알 수 없는 필드는 건너뛴다', allowed('User-agent: *\nCrawl-delay: 10\nDisallow: /a\n', '/a'), false)
t('Sitemap 줄이 그룹을 깨지 않는다', allowed('User-agent: *\nDisallow: /a\nSitemap: https://x/s.xml\n', '/a'), false)

// ── 구조 파싱 ─────────────────────────────────────────────────────
const g = parseRobots('User-agent: a\nUser-agent: b\nDisallow: /x\nUser-agent: *\nDisallow: /y\n')
t('그룹 2개로 갈린다', g.length, 2)
t('첫 그룹이 UA 2개를 공유', g[0].agents.length, 2)
t('둘째 그룹은 * 하나', g[1].agents[0], '*')
t('둘째 그룹 규칙이 첫 그룹에 안 샌다', g[0].rules.length, 1)

const reason = robotsVerdict(parseRobots(longest), '/search/private', TOKEN).reason
t('reason 에 근거 규칙이 담긴다', reason, 'Disallow: /search')

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) {
  console.log('robots 판정이 틀렸다. 이 상태로 수집을 돌리면 안 된다.')
  process.exit(1)
}
console.log('robots 판정 정상 — 금지 경로를 건드리지 않는다.')
