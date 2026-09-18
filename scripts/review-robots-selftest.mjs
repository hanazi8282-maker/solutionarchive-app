#!/usr/bin/env node
// robots.txt 판정 셀프테스트.
//
// 이 판정이 리뷰 수집 트랙에서 차단을 막는 유일한 안전장치다. 틀리면
// 금지된 경로를 긁고, 영구 차단되면 파이프라인 전체가 죽는다.
//
// Node 22+ 의 타입 스트리핑 덕에 .ts 를 그대로 import 한다(검증 환경: v24.16.0).

import { looksLikeMarkup, parseRobots, robotsCrawlDelaySec, robotsVerdict } from '../lib/review/robots.ts'

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

// ⚠️ 판정은 2026-09-18 부터 3상태다: allowed / disallowed / unverified.
//    "allowed 가 아니다" 를 한 글자로 접지 마라 — 금지와 확인 불가는 다음 행동이
//    정반대다(_principles.md §1). 그래서 헬퍼를 둘로 나눠 둔다.
const state = (txt, path, token = TOKEN) => robotsVerdict(parseRobots(txt), path, token).state
const allowed = (txt, path) => state(txt, path) === 'allowed'

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
// ⚠️ 2026-09-18 변경. 빈 robots.txt 는 **확인 불가**다.
//    그룹이 하나도 없으면 "규칙이 없다" / "HTML 을 robots 로 읽었다" / "파싱이
//    실패했다" 를 구분할 재료가 없다. 러너는 이 상태에서 요청하지 않는다.
t('robots.txt 가 비면 확인 불가다 (예전에는 허용이었다)', state('', '/x'), 'unverified')
const LF = String.fromCharCode(10)
t('공백만 있어도 확인 불가', state(['', '', '   ', ''].join(LF), '/x'), 'unverified')
t('주석만 있어도 확인 불가', state('# hello' + LF, '/x'), 'unverified')
t('CRLF 만 있어도 확인 불가', state(String.fromCharCode(13) + LF, '/x'), 'unverified')

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
// ⚠️ 2026-09-18 변경. 규칙 앞에 User-agent 가 없으면 그 규칙은 버려지고 그룹이
//    0개가 된다. 예전에는 그게 "허용"이었다 — 즉 `Disallow: /a` 라고 써 둔
//    사이트를 전면 허용으로 읽었다. 지금은 확인 불가다.
t('규칙 앞에 User-agent 가 없으면 그룹 0개 = 확인 불가', state('Disallow: /a\n', '/a'), 'unverified')
t('규칙 앞에 User-agent 가 없으면 규칙 자체가 버려진다', parseRobots('Disallow: /a\n').length, 0)
t('Crawl-delay 는 경로 규칙이 아니다', allowed('User-agent: *\nCrawl-delay: 10\nDisallow: /a\n', '/a'), false)
t('Sitemap 줄이 그룹을 깨지 않는다', allowed('User-agent: *\nDisallow: /a\nSitemap: https://x/s.xml\n', '/a'), false)

// ── 와일드카드 `*` 와 끝앵커 `$` (RFC 9309 §2.2.2) ────────────────
// 실측 사례: hacker-news.firebaseio.com/robots.txt 는 `Disallow: /` 로 전부 막고
// `Allow: /*.json$` 로 API 만 연다. 접두사 비교만 하던 시절엔 이 Allow 가 어떤
// 경로에도 안 걸려 "전부 금지"로 읽혔다.
const firebase = [
  'User-agent: *',
  'Allow: /*.json$',
  'Allow: /*.json?*$',
  'Disallow: /',
  '',
].join('\n')
t('와일드카드 Allow — .json 은 허용', allowed(firebase, '/v0/item/49628981.json'), true)
t(
  '와일드카드 Allow — 쿼리 붙은 .json 도 허용(두 번째 규칙)',
  allowed(firebase, '/v0/item/49628981.json?print=true'),
  true,
)
t('와일드카드 Allow — 그 외 경로는 Disallow: / 유지', allowed(firebase, '/some/other/path'), false)
t(
  '와일드카드 Allow — reason 이 실제 적용 규칙을 가리킨다',
  robotsVerdict(parseRobots(firebase), '/v0/item/1.json', TOKEN).reason,
  'Allow: /*.json$',
)

// 더 위험한 방향. 와일드카드 Disallow 가 조용히 무시되면 막아야 할 걸 못 막는다.
const pdf = 'User-agent: *\nDisallow: /*.pdf$\n'
t('와일드카드 Disallow — .pdf 로 끝나면 금지', allowed(pdf, '/report.pdf'), false)
t('와일드카드 Disallow — 깊은 경로의 .pdf 도 금지', allowed(pdf, '/a/b/report.pdf'), false)
t('끝앵커 — .pdf 로 끝나지 않으면 허용', allowed(pdf, '/report.pdf.html'), true)
t('끝앵커 — 쿼리가 붙으면 끝이 아니다', allowed(pdf, '/report.pdf?x=1'), true)

t('`*` 는 길이 0 과도 매칭', allowed('User-agent: *\nDisallow: /a*b\n', '/ab'), false)
t('`*` 중간 매칭', allowed('User-agent: *\nDisallow: /a*b\n', '/a/x/y/b/c'), false)
t('`*` 가 있어도 안 맞으면 허용', allowed('User-agent: *\nDisallow: /a*b\n', '/a/x/y'), true)
t('접두사 `*` 로 확장자 전체 금지', allowed('User-agent: *\nDisallow: /*.gif\n', '/img/x.gif?v=2'), false)
t('앵커만 있고 와일드카드 없음 — 정확히 그 경로만', allowed('User-agent: *\nDisallow: /a$\n', '/a'), false)
t('앵커만 있고 와일드카드 없음 — 하위 경로는 허용', allowed('User-agent: *\nDisallow: /a$\n', '/a/b'), true)
t('패턴 중간의 `$` 는 리터럴', allowed('User-agent: *\nDisallow: /a$b\n', '/a$b/c'), false)
t('패턴 중간의 `$` 는 리터럴 — 앵커로 읽으면 안 된다', allowed('User-agent: *\nDisallow: /a$b\n', '/a'), true)

// 최장 일치 기준은 **패턴 원문 길이**다(와일드카드 제외한 리터럴 수가 아니다).
const mixed = 'User-agent: *\nDisallow: /x\nAllow: /x/*/ok\n'
t('와일드카드가 섞여도 더 긴 패턴이 이긴다', allowed(mixed, '/x/1/ok'), true)
t('와일드카드 Allow 에 안 걸리면 Disallow 유지', allowed(mixed, '/x/1/no'), false)

// ── 정규식 특수문자는 리터럴로 취급 ───────────────────────────────
// 와일드카드 구현을 정규식으로 하면서 이스케이프를 빠뜨리면 `?` `.` `+` 가
// 메타문자로 새어 엉뚱한 경로를 막는다. 이 4건이 그 회귀 감시다.
t('`?` 는 리터럴', allowed('User-agent: *\nDisallow: /api/v1?query=\n', '/api/v1?query=x'), false)
t('`?` 는 리터럴 — 임의 1글자가 아니다', allowed('User-agent: *\nDisallow: /api/v1?query=\n', '/api/v1Xquery=x'), true)
t('`.` 는 리터럴', allowed('User-agent: *\nDisallow: /a.b\n', '/aXb'), true)
t('`+` 는 리터럴', allowed('User-agent: *\nDisallow: /a+b\n', '/a+b'), false)
t('`(` `[` 같은 문자가 있어도 정규식이 안 깨진다', allowed('User-agent: *\nDisallow: /a([b\n', '/a([b/c'), false)

// ── 기존 접두사 동작 불변 (와일드카드 없는 규칙) ──────────────────
// 아래 기대값은 이 수정 **이전** 코드를 실제로 돌려서 나온 값을 그대로 못박은
// 것이다. 특히 `/administrator` 가 막히는 건 접두사 비교의 알려진 성질이고,
// 이번 수정으로 바뀌면 안 된다(바꾸려면 별도 결정이 필요하다).
const adminOnly = 'User-agent: *\nDisallow: /admin\n'
t('접두사 불변 — /admin', allowed(adminOnly, '/admin'), false)
t('접두사 불변 — /admin/x', allowed(adminOnly, '/admin/x'), false)
t('접두사 불변 — /administrator 도 여전히 막힌다(접두사 성질)', allowed(adminOnly, '/administrator'), false)
t('접두사 불변 — 경로는 대소문자 구분', allowed(adminOnly, '/ADMIN'), true)

// ── ReDoS 방어 (투포인터 글롭 매처) ──────────────────────────────
// robots.txt 는 제3자 사이트에서 받아와 그대로 parseRobots→robotsVerdict 에
// 먹인다. 이전 정규식 구현은 `Disallow: /a****…****b`(연속 `*`) 나
// `/a*a*a*a*…`(리터럴 낀 `*`) 에서 파국적 백트래킹으로 nightly 수집기를
// 멈췄다(실측: 40*`*` + 60자 경로에 20초+). 아래 두 건이 그 회귀 감시다.
{
  const evilConsecutive = `User-agent: *\nDisallow: /a${'*'.repeat(40)}b\n`
  const evilAlternating = `User-agent: *\nDisallow: /${'a*'.repeat(30)}b\n`
  const victim = '/a' + 'a'.repeat(60) // 매치 실패를 강제해 최대 백트래킹 유발
  for (const [name, txt] of [['연속 *', evilConsecutive], ['리터럴 낀 *', evilAlternating]]) {
    const t0 = performance.now()
    const v = robotsVerdict(parseRobots(txt), victim, TOKEN)
    const dt = performance.now() - t0
    t(`ReDoS 방어 — ${name} 패턴이 100ms 안에 끝난다 (${dt.toFixed(1)}ms)`, dt < 100, true)
    t(`ReDoS 방어 — ${name}: 안 맞는 경로는 허용`, v.state, 'allowed')
  }
}
t('글롭 — 연속 `*` 는 하나처럼', allowed('User-agent: *\nDisallow: /a****b\n', '/axyzb'), false)
t('글롭 — 비앵커 접두사 매치(`/a*c` 는 `/abcd` 의 접두사 /abc 에 걸린다)', allowed('User-agent: *\nDisallow: /a*c\n', '/abcd'), false)
t('글롭 — 비앵커: 패턴이 경로보다 길면 불일치', allowed('User-agent: *\nDisallow: /a*bcdef\n', '/axb'), true)

// ── 구조 파싱 ─────────────────────────────────────────────────────
const g = parseRobots('User-agent: a\nUser-agent: b\nDisallow: /x\nUser-agent: *\nDisallow: /y\n')
t('그룹 2개로 갈린다', g.length, 2)
t('첫 그룹이 UA 2개를 공유', g[0].agents.length, 2)
t('둘째 그룹은 * 하나', g[1].agents[0], '*')
t('둘째 그룹 규칙이 첫 그룹에 안 샌다', g[0].rules.length, 1)

const reason = robotsVerdict(parseRobots(longest), '/search/private', TOKEN).reason
t('reason 에 근거 규칙이 담긴다', reason, 'Disallow: /search')

// ── 커뮤니티 소스 2종 — 실제 robots.txt 원문 (실측 2026-09-16) ────
//
// 짐작으로 쓴 게 아니라 그날 받은 원문을 잘라 붙였다. 사이트가 규칙을 바꾸면
// 이 테스트가 옛 규칙을 통과시키므로, 어댑터를 손댈 때 원문을 다시 받아 대조해라.
//
// ⚠️ 양쪽 다 **쿼리스트링을 대상으로 한 Disallow** 가 있다. robots.ts 는 쿼리를
//    포함한 경로를 주면 정확히 판정하지만, 러너는 u.pathname 만 넘겨서
//    (runner.ts:153) 실제 수집 경로에서는 이 규칙들이 매칭되지 않는다(SP-026).
//    아래 판정은 **robots.ts 가 옳다**는 것만 보증한다 — 러너가 그걸 쓰고
//    있다는 보증이 아니다. 둘을 헷갈리면 안 된다.

const damoangRobots = `# Angple Community Platform
User-agent: *
Allow: /

Disallow: /admin/
Disallow: /api/
Disallow: /install/
Disallow: /login
Disallow: /member/
Disallow: /my/
Disallow: /claim
Disallow: /truthroom
Disallow: /go/
Disallow: /bbs/link.php
Disallow: /plugin/
Disallow: /*?page=
Disallow: /*&page=

User-agent: GPTBot
Disallow: /

User-agent: anthropic-ai
Disallow: /

User-agent: Claude-Web
Disallow: /

User-agent: trend-archive
Disallow: /

User-agent: CollectorHub
Disallow: /

Sitemap: https://damoang.net/sitemap.xml
`

// (a) 수집 대상 글 경로 — 허용이어야 한다
t('다모앙: 글 경로는 허용', allowed(damoangRobots, '/free/7341567'), true)
t('다모앙: 게시판 목록도 허용', allowed(damoangRobots, '/free'), true)
// (b) 실제 금지 경로 — 막혀야 한다
t('다모앙: /admin/ 금지', allowed(damoangRobots, '/admin/config'), false)
t('다모앙: /api/ 금지', allowed(damoangRobots, '/api/comment'), false)
t('다모앙: /member/ 금지', allowed(damoangRobots, '/member/google_x'), false)
t('다모앙: /truthroom 금지', allowed(damoangRobots, '/truthroom'), false)
t('다모앙: 레거시 /bbs/link.php 금지', allowed(damoangRobots, '/bbs/link.php'), false)
// 와일드카드 + 쿼리 — 댓글 페이지네이션을 붙이면 여기 걸린다
t('다모앙: ?page= 는 금지 (깊은 페이지네이션)', allowed(damoangRobots, '/free/7341567?page=2'), false)
t('다모앙: &page= 도 금지', allowed(damoangRobots, '/free?sort=new&page=3'), false)

// reason 이 "규칙 없음"이 아니라 실제 매칭 규칙을 가리켜야 한다
t(
  '다모앙: reason 이 실제 규칙을 가리킨다',
  robotsVerdict(parseRobots(damoangRobots), '/admin/config', TOKEN).reason,
  'Disallow: /admin/',
)
t(
  '다모앙: ?page= 의 reason 도 실제 규칙',
  robotsVerdict(parseRobots(damoangRobots), '/free/1?page=2', TOKEN).reason,
  'Disallow: /*?page=',
)

// ⚠️ 우리 UA 는 AI 크롤러 차단 목록에 없어 `*` 그룹을 적용받는다.
//    "그래서 허용"이라는 기계 판정과, 사이트가 자칭 수집기를 거부한다는
//    사실은 별개다 — 후자는 사람이 판단했다(SP-025).
t('다모앙: 우리 UA 는 AI크롤러 그룹에 안 걸린다(= * 그룹 적용)', allowed(damoangRobots, '/free/1'), true)
t('다모앙: anthropic-ai 로 오면 전면 금지다', robotsVerdict(parseRobots(damoangRobots), '/free/1', 'anthropic-ai').state, 'disallowed')
t('다모앙: CollectorHub 로 오면 전면 금지다', robotsVerdict(parseRobots(damoangRobots), '/free/1', 'CollectorHub').state, 'disallowed')

const cook82Robots = `User-agent: Googlebot
Disallow:

User-agent: *
Disallow: /tempfile/
Disallow: /tempimg/
Disallow: /ajax/
Disallow: /temp/
Disallow: /zb41/
Disallow: /entiz/read.php?bn=15&num=1166440&page=6

User-agent: Mediapartners-Google
Disallow:

User-agent: KaBot
Disallow:

sitemap: http://www.82cook.com/sitemap.xml
`

// (a) 수집 대상 글 경로 — 허용
t('82cook: 글 경로는 허용', allowed(cook82Robots, '/entiz/read.php?num=4239440'), true)
t('82cook: 게시판 목록도 허용', allowed(cook82Robots, '/entiz/enti.php?bn=15'), true)
// (b) 실제 금지 경로 — 막혀야 한다
t('82cook: /ajax/ 금지', allowed(cook82Robots, '/ajax/reple.php'), false)
t('82cook: /temp/ 금지', allowed(cook82Robots, '/temp/x'), false)
t('82cook: /tempfile/ 금지', allowed(cook82Robots, '/tempfile/a.jpg'), false)
t('82cook: /zb41/ 금지', allowed(cook82Robots, '/zb41/old.php'), false)
// 콕 집어 금지된 글 1건. 쿼리까지 줘야 걸린다.
t('82cook: 금지된 그 글은 막힌다', allowed(cook82Robots, '/entiz/read.php?bn=15&num=1166440&page=6'), false)
t('82cook: 옆 글은 막히지 않는다', allowed(cook82Robots, '/entiz/read.php?bn=15&num=1166441&page=6'), true)
// ⚠️ 이 줄이 SP-026 의 증거다 — 쿼리를 떼면 금지된 그 글도 "허용"이 된다.
t('82cook: 쿼리를 떼면 금지 글도 허용으로 보인다(러너의 구멍)', allowed(cook82Robots, '/entiz/read.php'), true)
t(
  '82cook: reason 이 실제 규칙을 가리킨다',
  robotsVerdict(parseRobots(cook82Robots), '/ajax/x', TOKEN).reason,
  'Disallow: /ajax/',
)

// ── 보배드림 — 실제 robots.txt 원문 (실측 2026-09-17) ─────────────
//
// 전면 허용이다. 금지 경로가 하나도 없고 Amazonbot 만 막는다.
// damoang·82cook 과 달리 쿼리 대상 Disallow 가 없어 SP-026 구멍을 안 밟는다.
//
// ⚠️ **"규칙이 없으니 마음대로"가 아니다.** 같은 라운드에서 네이버 블로그는
//    robots 본문에 RAG 목적 수집 금지를 적어 뒀고 ClaudeBot 을 이름으로
//    막았다(docs/review-source-findings.md). 기계 판정과 사이트의 의사는
//    별개다 — 새 소스를 넣을 때 원문을 눈으로 읽어라.

const bobaedreamRobots = `User-agent: *
Allow: /

User-agent: grapeshot
Disallow:

User-agent: Amazonbot
Disallow: /
`

// (a) 수집 대상 글 경로 — 허용
t('보배드림: 글 경로는 허용', allowed(bobaedreamRobots, '/view?code=freeb&No=2000000'), true)
t('보배드림: 게시판 목록도 허용', allowed(bobaedreamRobots, '/list?code=freeb'), true)
t('보배드림: 루트도 허용', allowed(bobaedreamRobots, '/'), true)
// (b) 금지 경로가 없다는 것을 그냥 단정하지 않고, 다른 소스에서 막히는
//     경로들이 여기서는 안 막히는지로 확인한다.
t('보배드림: /admin/ 도 막히지 않는다 (규칙 자체가 없다)', allowed(bobaedreamRobots, '/admin/config'), true)
t('보배드림: ?page= 도 막히지 않는다', allowed(bobaedreamRobots, '/list?code=freeb&page=3'), true)
// (c) 이름으로 막힌 봇은 실제로 막혀야 한다 — Allow: / 가 그걸 덮으면 안 된다.
t('보배드림: Amazonbot 으로 오면 전면 금지다', robotsVerdict(parseRobots(bobaedreamRobots), '/view', 'Amazonbot').state, 'disallowed')
t('보배드림: 우리 UA 는 * 그룹을 적용받는다', allowed(bobaedreamRobots, '/view?code=freeb&No=1'), true)

// ── 텀블벅 — 실제 robots.txt 원문 (실측 2026-09-17) ───────────────

const tumblbugRobots = `User-agent: *
Disallow: /api/
Disallow: /auth/
Disallow: /sessions/
Disallow: /oauth/
Allow: /discover?category=
Disallow: /discover?
Disallow: /search?

Sitemap: https://www.tumblbug.com/sitemap/sitemap.xml
`

// (a) 수집 대상 — 프로젝트 경로는 한 세그먼트다(`/project/<slug>` 아님)
t('텀블벅: 프로젝트 경로는 허용', allowed(tumblbugRobots, '/eastereggs'), true)
t('텀블벅: 스토리 탭도 허용', allowed(tumblbugRobots, '/eastereggs/story'), true)
// (b) 실제 금지 경로 — 후원자 코멘트가 오는 XHR 이 여기 걸린다
t('텀블벅: /api/ 금지 (코멘트 XHR 이 여기다)', allowed(tumblbugRobots, '/api/projects/1/comments'), false)
t('텀블벅: /auth/ 금지', allowed(tumblbugRobots, '/auth/login'), false)
t('텀블벅: /sessions/ 금지', allowed(tumblbugRobots, '/sessions/new'), false)
t('텀블벅: /oauth/ 금지', allowed(tumblbugRobots, '/oauth/token'), false)
t(
  '텀블벅: reason 이 실제 규칙을 가리킨다',
  robotsVerdict(parseRobots(tumblbugRobots), '/api/x', TOKEN).reason,
  'Disallow: /api/',
)
// ⚠️ `/discover?` `/search?` 는 **쿼리 대상 규칙**이라 러너가 못 막는다(SP-026).
//    아래 두 줄이 그 구멍의 증거다 — 그래서 어댑터가 직접 거부한다.
t('텀블벅: 쿼리를 주면 /discover? 가 막힌다', allowed(tumblbugRobots, '/discover?query=x'), false)
t('텀블벅: 쿼리를 떼면 허용으로 보인다(러너의 구멍)', allowed(tumblbugRobots, '/discover'), true)

// ── 네이버 블로그 — 실제 robots.txt 원문 (실측 2026-09-17) ────────
//
// ⚠️⚠️ **이 원문을 눈으로 읽어라.** 기계 판정과 사이트의 의사가 갈리는
//    대표 사례다. 아래 주석 배너는 실제 robots.txt 에 있는 문장 그대로다.
//    우리 UA 는 이름 목록에 없어 `*` 그룹을 적용받고 `/PostView.naver` 는
//    Disallow 에 없어서 **기계 판정은 allowed** 가 나온다. 그 판정을 근거로
//    쓰면 안 된다 — 약관은 별개로 금지한다(SP-030).

const naverBlogRobots = `User-agent: Yeti
Disallow: /

# BOT ACCESS FOR THE PURPOSES OF AI TRAINING AND RETRIEVAL-AUGMENTED GENERATION (RAG) IS STRICTLY PROHIBITED.
User-agent: GPTBot
Disallow: /
User-agent: OAI-SearchBot
Disallow: /
User-agent: PerplexityBot
Disallow: /
User-agent: Google-Extended
Disallow: /
User-agent: ClaudeBot
Disallow: /
User-agent: Claude-SearchBot
Disallow: /
User-agent: meta-externalagent
Disallow: /
User-agent: Applebot-Extended
Disallow: /
User-agent: CCBot
Disallow: /

User-agent: *
Disallow: /PostList.naver
Disallow: /PostPrint.naver
Disallow: /NBlogPostPreview.naver
Disallow: /NBlogHidden.naver
Disallow: /BlogInfo.naver
Disallow: /PostExportDoc.naver
Disallow: /PostPreview.naver
Disallow: /buddy/
Disallow: /export/
Disallow: /common/
Disallow: /post/
Disallow: /npost/
Disallow: /main/
Disallow: /guestbook/
Disallow: comment.naver
Disallow: /socialapp/
Disallow: /upload/
Disallow: /connect/
`

// (a) 수집 대상 경로 — 기계 판정은 허용이다
t('네이버: /PostView.naver 는 기계 판정상 허용', allowed(naverBlogRobots, '/PostView.naver'), true)
// (b) 실제 금지 경로 — 어댑터의 /PostView.naver 한정 가드가 이것들을 다시 막는다
t('네이버: /PostList.naver 금지', allowed(naverBlogRobots, '/PostList.naver'), false)
t('네이버: /PostPrint.naver 금지', allowed(naverBlogRobots, '/PostPrint.naver'), false)
t('네이버: /PostPreview.naver 금지', allowed(naverBlogRobots, '/PostPreview.naver'), false)
t('네이버: /NBlogPostPreview.naver 금지', allowed(naverBlogRobots, '/NBlogPostPreview.naver'), false)
t('네이버: /BlogInfo.naver 금지', allowed(naverBlogRobots, '/BlogInfo.naver'), false)
t('네이버: /guestbook/ 금지', allowed(naverBlogRobots, '/guestbook/list'), false)
t('네이버: /post/ 금지', allowed(naverBlogRobots, '/post/x'), false)
t(
  '네이버: reason 이 실제 규칙을 가리킨다',
  robotsVerdict(parseRobots(naverBlogRobots), '/PostList.naver', TOKEN).reason,
  'Disallow: /PostList.naver',
)

// (c) ⚠️ 여기가 SP-030 의 핵심이다. **이름으로 오면 전면 금지**인데
//     우리 UA 는 그 목록에 없어 통과한다. 이 두 줄이 같이 참이라는 것이
//     "기계 판정 allowed" 를 근거로 쓰면 안 되는 이유다.
t('네이버: ClaudeBot 으로 오면 전면 금지다', robotsVerdict(parseRobots(naverBlogRobots), '/PostView.naver', 'ClaudeBot').state, 'disallowed')
t('네이버: Claude-SearchBot 도 전면 금지다', robotsVerdict(parseRobots(naverBlogRobots), '/PostView.naver', 'Claude-SearchBot').state, 'disallowed')
t('네이버: GPTBot 도 전면 금지다', robotsVerdict(parseRobots(naverBlogRobots), '/PostView.naver', 'GPTBot').state, 'disallowed')
t('네이버: 그런데 우리 UA 는 * 그룹이라 allowed 다', allowed(naverBlogRobots, '/PostView.naver'), true)
// robots 원문에 적힌 의사 표시. 파서는 주석을 안 읽지만 사람은 읽어야 한다.
t(
  '네이버: robots 원문에 RAG 목적 수집 금지가 적혀 있다(SP-030)',
  /RETRIEVAL-AUGMENTED GENERATION \(RAG\) IS STRICTLY PROHIBITED/.test(naverBlogRobots),
  true,
)

// ── robots.txt 가 아예 없는 소스 — theqoo · todayhumor (2026-09-16 실측) ──
//
// 두 사이트 모두 `/robots.txt` 가 **HTTP 404** 다. 러너는 4xx 를 "규칙 없음 =
// 허용"으로 처리한다(RFC 9309, runner.ts:143). 여기서 확인하는 건 두 가지다.
//
// (1) **소프트 404 트립와이어.** 404 라서 지금은 본문이 parseRobots 에 들어가지
//     않는다. 그런데 상태가 200 으로 바뀌면 같은 HTML 이 parseRobots 로 들어가고,
//     그때도 답은 똑같이 `allowed: true / '규칙 없음'` 이다. **"규칙이 없다"와
//     "HTML 을 robots 로 읽었다"가 한 값이 된다**(CLAUDE.md §7.1). 지금 그
//     성질을 못으로 박아 두어, 나중에 진짜 robots 가 올라오면 아래 줄이 깨지게 한다.
// (2) 그때 우리가 못 보게 될 규칙이 무엇인지 — todayhumor 는 글 주소가 쿼리형이라
//     SP-026(러너가 pathname 만 넘김)에 정면으로 걸린다.

// 실측 응답 본문 그대로(앞부분). https://theqoo.net/robots.txt → 404 text/html
const theqooSoft404 = `<!DOCTYPE html>
<html lang="ko">
<head>

<!-- META -->
<meta charset="utf-8">
<meta name="generator" content="Rhymix">
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no" />
<meta name="csrf-token" content="B3c62g5Sosbucxhv" />

<!-- TITLE -->
<title></title>
</head>
</html>
`

// 실측 응답 본문 그대로(전문). https://www.todayhumor.co.kr/robots.txt → 404
const todayhumor404 = `<!DOCTYPE HTML PUBLIC "-//IETF//DTD HTML 2.0//EN">
<html><head>
<title>404 Not Found</title>
</head><body>
<h1>Not Found</h1>
<p>The requested URL /robots.txt was not found on this server.</p>
</body></html>
`

// ⚠️ 2026-09-18 정정. 위 (1) 이 예고한 구멍을 막았다 — 아래 줄들이 **뒤집혔다.**
//    같은 HTML 이 200 으로 와도 이제 "허용"이 되지 않는다. 두 겹으로 막는다:
//      (a) looksLikeMarkup 이 본문을 HTML 로 판정한다 (상태 코드와 무관하게)
//      (b) 설령 (a)를 빠져나가도 그룹이 0개라 robotsVerdict 가 unverified 를 낸다
t('theqoo: 404 HTML 을 robots 로 읽으면 규칙 0개가 된다', parseRobots(theqooSoft404).length, 0)
t('theqoo: 그 HTML 은 마크업으로 판정된다', looksLikeMarkup(theqooSoft404), true)
t('theqoo: 판정은 허용이 아니라 확인 불가다', state(theqooSoft404, '/square/4347529638'), 'unverified')
t(
  'theqoo: 사유가 "규칙 없음"이 아니라 "그룹을 읽지 못했다"다',
  robotsVerdict(parseRobots(theqooSoft404), '/square/1', TOKEN).reason,
  'robots.txt 에서 그룹을 하나도 읽지 못했다',
)
t('todayhumor: 404 HTML 도 규칙 0개', parseRobots(todayhumor404).length, 0)
t('todayhumor: 그 HTML 도 마크업으로 판정된다', looksLikeMarkup(todayhumor404), true)
t('todayhumor: 글 경로도 확인 불가다', state(todayhumor404, '/board/view.php?table=bestofbest&no=483825'), 'unverified')

// ⚠️ SP-026 트립와이어. todayhumor 가 나중에 robots 를 올리고 거기에 쿼리 규칙을
//    넣으면, 러너는 pathname 만 넘기므로 그 규칙을 **못 본다**. 아래 두 줄이
//    그 구멍을 그대로 보여 준다 — 같은 글이 쿼리를 붙이면 금지, 떼면 허용이다.
const futureTodayhumorRobots = 'User-agent: *\nDisallow: /board/view.php?table=bestofbest\n'
t('todayhumor(가정): 쿼리까지 주면 금지된다', allowed(futureTodayhumorRobots, '/board/view.php?table=bestofbest&no=1'), false)
t('todayhumor(가정): 쿼리를 떼면 허용으로 보인다 — 러너의 구멍', allowed(futureTodayhumorRobots, '/board/view.php'), true)

// ── round-3 실측 robots — brunch · clien · fmkorea (2026-09-17) ──
//
// 세 소스의 사정이 전부 다르다. 아래는 각 사이트 robots.txt 응답 원문에서
// 우리 판정에 걸리는 부분을 그대로 옮긴 것이다.

// https://brunch.co.kr/robots.txt → 200. `*` 그룹 원문(발췌 아님, 그 그룹 전체).
const brunchRobots = `# brunch.co.kr
# Last updated: 2026-04-22

User-agent: GPTBot
User-agent: ClaudeBot
User-agent: anthropic-ai
User-agent: Claude-Web
Disallow: /

User-agent: Googlebot
User-agent: Yeti
User-agent: Daumoa
Disallow: /write
Disallow: /api/
Crawl-delay: 1

User-agent: Baiduspider
User-agent: *
Disallow: /write
Disallow: /ready
Disallow: /library
Disallow: /me/
Disallow: /feed
Disallow: /search
Disallow: /api/
Disallow: /admin/
Disallow: /login
Disallow: /logout
Disallow: /embed/
Disallow: /preview/
Disallow: /*/stats$
Disallow: /*?timestamp=*
Disallow: /*?*utm_source=*
Disallow: /*?fbclid=*
Disallow: /*?gclid=*
Crawl-delay: 5
`

t('brunch: 글 경로는 허용', allowed(brunchRobots, '/@brunch/431'), true)
t('brunch: /write 금지', allowed(brunchRobots, '/write'), false)
t('brunch: /search 금지', allowed(brunchRobots, '/search'), false)
t('brunch: /api/ 금지 — 댓글이 여기 있다', allowed(brunchRobots, '/api/comment/431'), false)
t('brunch: /me/ 금지', allowed(brunchRobots, '/me/x'), false)
t('brunch: 통계 페이지 금지 ($ 앵커)', allowed(brunchRobots, '/@brunch/stats'), false)
t('brunch: stats 로 끝나지 않으면 허용', allowed(brunchRobots, '/@brunch/stats/2'), true)
// AI 학습 크롤러 그룹이 앞에 있다. 우리 토큰은 그 목록에 없으므로 `*` 그룹을 받는다.
t('brunch: 우리 토큰은 AI 크롤러 그룹에 없어 `*` 규칙을 받는다', robotsVerdict(parseRobots(brunchRobots), '/@brunch/431', TOKEN).reason, '일치하는 규칙 없음')
t('brunch: ClaudeBot 이었다면 전면 금지였다', robotsVerdict(parseRobots(brunchRobots), '/@brunch/431', 'claudebot').state, 'disallowed')
// ⚠️ robots.ts 는 Crawl-delay 를 파싱하지 않는다. 그 사실을 여기 못으로 박는다 —
//    `*` 그룹의 Crawl-delay: 5 를 지키는 건 DB 의 min_interval_ms 뿐이다.
t(
  'brunch: Crawl-delay 는 규칙으로 파싱되지 않는다 (min_interval_ms 가 유일한 장치)',
  parseRobots(brunchRobots).every((g) => g.rules.every((r) => !/crawl/i.test(r.path))),
  true,
)

// ── 클리앙 — 우리 UA 에게는 404 다 (SP-027) ──────────────────────
//
// ⚠️ 이건 theqoo·todayhumor 의 "robots 가 없다"와 **다른 사건**이다.
//    규칙은 존재한다. 우리에게만 안 보여 준다.
//      우리 봇 UA  → www 404 · apex 404
//      브라우저 UA → www 200(규칙 있음) · apex 404
//    러너는 404 를 "규칙 없음 = 허용"으로 캐시하므로, 아래 진짜 규칙이 판정에
//    한 번도 반영되지 않는다. 그래서 clien.ts 가 이 규칙을 코드로 들고 있다.

const clien404 = `<!DOCTYPE HTML PUBLIC "-//IETF//DTD HTML 2.0//EN">
<html><head>
<title>404 Not Found</title>
</head><body>
<h1>Not Found</h1>
<p>The requested URL was not found on this server.</p>
</body></html>
`

// 브라우저 UA 로 받은 https://www.clien.net/robots.txt 원문(`*` 그룹 전체).
const clienRealRobots = `User-agent: *
Allow:/service/board/
Disallow:/service/group/
Disallow:/service/board/sold/
Disallow:/service/board/hongbo/
Disallow:/service/mypage/
Disallow:/service/message/
Disallow:/service/popup/
Disallow:/service/search/
Disallow:/service/search*
Disallow:/service/cs/
Disallow:/service/recommend
Disallow: /*?*
`

t('clien: 404 HTML 을 robots 로 읽으면 규칙 0개', parseRobots(clien404).length, 0)
t('clien: 그 HTML 은 마크업으로 판정된다', looksLikeMarkup(clien404), true)
// ⚠️ 2026-09-18 뒤집혔다. 예전에는 여기서 "허용"이 나왔고, 그래서 사이트가
//    실제로 건 규칙(아래 clienRealRobots)이 판정에 한 번도 반영되지 않았다.
t('clien: 판정은 허용이 아니라 확인 불가다', state(clien404, '/service/board/park/19264755'), 'unverified')
t(
  'clien: 사유가 "그룹을 읽지 못했다"다 — 실재하는 규칙과 섞이지 않는다',
  robotsVerdict(parseRobots(clien404), '/service/board/sold/1', TOKEN).reason,
  'robots.txt 에서 그룹을 하나도 읽지 못했다',
)
// 아래가 우리가 **못 보는** 진짜 규칙이다. 어댑터가 대신 지킨다.
t('clien(실재): 글 경로는 허용', allowed(clienRealRobots, '/service/board/park/19264755'), true)
t('clien(실재): /service/board/sold/ 금지 — 404 판정으로는 허용이었다', allowed(clienRealRobots, '/service/board/sold/1'), false)
t('clien(실재): /service/board/hongbo/ 금지', allowed(clienRealRobots, '/service/board/hongbo/1'), false)
t('clien(실재): /service/group/ 금지', allowed(clienRealRobots, '/service/group/community'), false)
t('clien(실재): /service/mypage/ 금지', allowed(clienRealRobots, '/service/mypage/1'), false)
t('clien(실재): /service/recommend 금지', allowed(clienRealRobots, '/service/recommend'), false)
// ⚠️ `Disallow: /*?*` 는 게시판 글에는 **안 걸린다.** 최장 일치 규칙 때문이다:
//    `Allow:/service/board/`(20자) > `Disallow: /*?*`(4자) 라 Allow 가 이긴다.
//    즉 기계 판정만 따르면 `?po=2` 가 붙은 글도 허용이다. 그런데 사이트가 저
//    줄을 쓴 의도는 명백히 쿼리 차단이다. 그래서 clien.ts 의 가드는 robots
//    판정보다 **일부러 더 엄격하다** — 쿼리형 ref 를 아예 안 받는다.
//    이 줄은 그 차이를 감추지 않고 그대로 적어 둔 것이다(CLAUDE.md §7.1).
t('clien(실재): 게시판 밖에서는 쿼리 차단이 실제로 걸린다', allowed(clienRealRobots, '/service/etc/x?po=2'), false)
t('clien(실재): 게시판 안에서는 최장일치로 Allow 가 이긴다', allowed(clienRealRobots, '/service/board/park/1?po=2'), true)
t(
  'clien(실재): 그 사유가 Allow 접두임을 못박는다',
  robotsVerdict(parseRobots(clienRealRobots), '/service/board/park/1', TOKEN).reason,
  'Allow: /service/board/',
)

// https://www.fmkorea.com/robots.txt → 200. `*` 그룹 원문(그 그룹 전체).
const fmkoreaRobots = `User-agent: anthropic-ai
User-agent: ClaudeBot
User-agent: GPTBot
User-agent: PerplexityBot
Disallow: /
Allow: /$

User-agent: Googlebot
User-agent: Yeti
Allow: /

User-agent: *
Disallow: /

Allow: /$
Allow: /best
Allow: /best2
Allow: /humor

Disallow: /*listStyle=
Disallow: /*act=IS$
Disallow: /*search_keyword=
Disallow: /*module_srl=
Disallow: /_loader
`

// 최장 일치: `Allow: /best`(5) > `Disallow: /`(1).
t('fmkorea: /best/<id> 허용', allowed(fmkoreaRobots, '/best/10342734564'), true)
t('fmkorea: /best2 허용', allowed(fmkoreaRobots, '/best2/1'), true)
t('fmkorea: /humor 허용', allowed(fmkoreaRobots, '/humor/1'), true)
t('fmkorea: 루트는 허용($ 앵커)', allowed(fmkoreaRobots, '/'), true)
// XE 기본 주소. 어댑터가 ref 단계에서 끊는 이유가 이것이다.
t('fmkorea: /8123456 은 금지', allowed(fmkoreaRobots, '/8123456'), false)
t('fmkorea: /index.php 금지', allowed(fmkoreaRobots, '/index.php'), false)
t('fmkorea: /_loader 금지', allowed(fmkoreaRobots, '/_loader'), false)
t(
  'fmkorea: 허용 사유가 실제 Allow 규칙을 가리킨다',
  robotsVerdict(parseRobots(fmkoreaRobots), '/best/1', TOKEN).reason,
  'Allow: /best',
)
t('fmkorea: ClaudeBot 이었다면 글이 금지였다', robotsVerdict(parseRobots(fmkoreaRobots), '/best/1', 'claudebot').state, 'disallowed')
// ⚠️ 쿼리 규칙은 러너가 판정 못 한다(SP-026). 어댑터가 쿼리 ref 를 안 만드는 이유.
t('fmkorea: listStyle 쿼리까지 주면 금지', allowed(fmkoreaRobots, '/best/1?listStyle=viewer'), false)
t('fmkorea: 쿼리를 떼면 허용으로 보인다 — 러너의 구멍', allowed(fmkoreaRobots, '/best/1'), true)

// ── 3상태 판정 — 우리 UA 에 적용되는 그룹이 없는 경우 (2026-09-18) ──
//
// 구멍 ③. `goodchoice.kr` 이 실측 반례다 — robots.txt 는 200 인데 특정 봇
// 그룹만 있고 `User-agent: *` 가 아예 없다. 예전 파서는 "해당 그룹 없음 →
// 허용"을 돌려줬다. 사이트가 우리에 대해 아무 말도 하지 않은 것을 초대로 읽은 것이다.

const noStarGroup = `User-agent: Googlebot
Disallow: /admin/

User-agent: Yeti
Disallow: /admin/
`

t('우리 UA 그룹이 없으면 확인 불가', state(noStarGroup, '/domestic/search'), 'unverified')
t(
  '그 사유가 "그룹이 없다"임을 못박는다',
  robotsVerdict(parseRobots(noStarGroup), '/domestic/search', TOKEN).reason,
  '우리 UA 에 적용되는 User-agent 그룹이 없다',
)
t('Googlebot 으로 오면 그 그룹을 받는다 (반대 방향 확인)', state(noStarGroup, '/admin/x', 'Googlebot'), 'disallowed')
t('우리 토큰이 그룹에 있으면 확인 불가가 아니다', state(noStarGroup + 'User-agent: ' + TOKEN + LF + 'Disallow: /x' + LF, '/y'), 'allowed')

// ── 사촌 사례 — `*` 그룹은 있는데 규칙이 0개 (velog 57B · docs.github.com 13B) ──
//
// ⚠️ 이건 **허용으로 판정한다.** RFC 9309 §2.2.2 대로 빈 그룹은 제약을 걸지
//    않는다. 위 "그룹이 없다"와는 다른 사건이다 — 사이트가 우리를 포함하는
//    그룹을 **쓰긴 썼다.**
//    다만 사유를 따로 낸다. "금지하지 않았다"를 "허용해 줬다"로 읽고 채택 근거로
//    쓰는 걸 막는 장치다. velog 의 실제 채택 근거는 robots 가 아니라 이용약관이다
//    (lib/review/adapters/velog.ts 헤더).

const velogRobots = '# https://www.robotstxt.org/robotstxt.html' + LF + 'User-agent: *' + LF

t('velog: `*` 그룹이 1개 파싱된다', parseRobots(velogRobots).length, 1)
t('velog: 그 그룹의 규칙은 0개다', parseRobots(velogRobots)[0].rules.length, 0)
t('velog: 판정은 허용이다 (그룹이 없는 것과 다른 사건)', state(velogRobots, '/@velopert/x'), 'allowed')
t(
  'velog: 사유가 "규칙 0개"를 드러낸다 — 초대가 아니다',
  robotsVerdict(parseRobots(velogRobots), '/@velopert/x', TOKEN).reason,
  '적용 그룹에 규칙이 0개 — 금지하지 않았을 뿐 초대는 아니다',
)

// ── 구멍 ① — robots.txt 자리에 온 HTML (looksLikeMarkup) ──
//
// 킥스타터는 robots.txt 가 403(Cloudflare 챌린지 HTML), `www.tistory.com` 은 404.
// 상태 코드로 거르는 것만으로는 부족하다 — **200 에 HTML 을 주는 소프트 404** 가 있고
// 그때 상태는 200, 규칙은 0개다. 그래서 본문 자체를 본다.

t('마크업 판정: doctype', looksLikeMarkup('<!DOCTYPE html>' + LF + '<html></html>'), true)
t('마크업 판정: 앞에 빈 줄이 있어도', looksLikeMarkup(LF + LF + '  <html lang="ko">'), true)
t('마크업 판정: BOM 이 붙어도', looksLikeMarkup(String.fromCharCode(0xfeff) + '<html>'), true)
t('마크업 판정: 주석 뒤 첫 줄이 태그여도', looksLikeMarkup('# x' + LF + '<html>'), true)
// Cloudflare 챌린지 페이지는 본문 한참 뒤에 태그가 오고, 앞쪽에 텍스트가 섞인다.
t(
  '마크업 판정: 첫 줄이 태그가 아니어도 앞 4KB 안에 <html> 이 있으면 마크업',
  looksLikeMarkup('Just a moment...' + LF + '<html><head><title>Attention Required</title>'),
  true,
)
t('마크업 판정: 진짜 robots 는 마크업이 아니다', looksLikeMarkup('User-agent: *' + LF + 'Disallow: /a' + LF), false)
t('마크업 판정: 주석만 있는 robots 도 마크업이 아니다', looksLikeMarkup('# nothing here' + LF), false)
t('마크업 판정: 빈 본문은 마크업이 아니다 (판정은 robotsVerdict 가 unverified 로 낸다)', looksLikeMarkup(''), false)
// `Disallow: /*.html` 같은 규칙이 마크업으로 오판되면 정상 robots 가 전부 막힌다.
t('마크업 판정: .html 을 막는 규칙은 오판하지 않는다', looksLikeMarkup('User-agent: *' + LF + 'Disallow: /*.html' + LF), false)

// ── Crawl-delay — 파서가 읽고, 쓰는 쪽은 runner 의 Pacer 다 ──
//
// ⚠️ 2026-09-18 까지 이 파서가 없었다. robots 가 `Crawl-delay: 5` 를 선언해도
//    러너는 못 읽었고, 유일한 방어선이 `review_sources.min_interval_ms` 의
//    **사람이 손으로 넣은 값**이었다. brunch 가 그 경우다.

t('brunch: `*` 그룹의 Crawl-delay 5 를 읽는다', robotsCrawlDelaySec(parseRobots(brunchRobots), TOKEN), 5)
t('brunch: Googlebot 은 자기 그룹의 1 을 받는다', robotsCrawlDelaySec(parseRobots(brunchRobots), 'Googlebot'), 1)
t('brunch: ClaudeBot 그룹에는 선언이 없다 → null', robotsCrawlDelaySec(parseRobots(brunchRobots), 'claudebot'), null)
t('Crawl-delay 선언이 없으면 null (0 이 아니다)', robotsCrawlDelaySec(parseRobots('User-agent: *' + LF + 'Allow: /' + LF), TOKEN), null)
t('Crawl-delay: 0 은 null 이 아니라 0 이다', robotsCrawlDelaySec(parseRobots('User-agent: *' + LF + 'Crawl-delay: 0' + LF + 'Allow: /' + LF), TOKEN), 0)
t('소수 Crawl-delay 도 읽는다', robotsCrawlDelaySec(parseRobots('User-agent: *' + LF + 'Crawl-delay: 0.5' + LF + 'Allow: /' + LF), TOKEN), 0.5)
t('숫자가 아닌 Crawl-delay 는 무시한다', robotsCrawlDelaySec(parseRobots('User-agent: *' + LF + 'Crawl-delay: soon' + LF + 'Allow: /' + LF), TOKEN), null)
// 같은 UA 그룹이 여러 번 나오면 **큰 쪽**을 쓴다. 작은 쪽으로 덮으면 규율을 완화한다.
t(
  '같은 UA 그룹이 둘이면 Crawl-delay 는 큰 쪽',
  robotsCrawlDelaySec(
    parseRobots('User-agent: *' + LF + 'Crawl-delay: 2' + LF + 'Allow: /a' + LF + LF + 'User-agent: *' + LF + 'Crawl-delay: 9' + LF + 'Allow: /b' + LF),
    TOKEN,
  ),
  9,
)
// Crawl-delay 가 rules 에 섞이면 경로 매칭 대상이 되어 엉뚱한 경로를 막는다.
t(
  'Crawl-delay 는 rules 에 들어가지 않는다',
  parseRobots(brunchRobots).every((g) => g.rules.every((r) => !/crawl/i.test(r.path))),
  true,
)

// ⚠️ 총계 출력은 **항상 파일 맨 아래**에 있어야 한다. 위에 두면 그 뒤에 붙은
//    테스트의 실패가 종료 코드에 반영되지 않아, 초록불인데 깨진 상태가 된다.
//    (round-2 에서 실제로 한 번 그렇게 붙였다.)
console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) {
  console.log('robots 판정이 틀렸다. 이 상태로 수집을 돌리면 안 된다.')
  process.exit(1)
}
console.log('robots 판정 정상 — 금지 경로를 건드리지 않는다.')
