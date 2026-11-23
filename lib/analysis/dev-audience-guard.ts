// 개발자·관리자 대상 글 가드(v71dm, 규칙 기반·결정적) — rr-v2 자동 승인 범위를 **좁히기만** 한다.
//
// 왜: 2026-11-23 자동 승인 2,000건 중 사람 채점 30건에서 오류 7건이 전부 hackernews·포럼(suitecrm_community·obsidian_forum·
//   mautic_forum)에서 나왔다(앱스토어·구글 플레이 0건). 오류 글의 공통점은 "사용자의 목소리"가 아니라 개발자·관리자에게 하는 말이었다:
//   포럼 버그 신고 양식, 버전+고장 보고, 소스 코드 분석, 설치·운영 안내.
//
// 원칙: 확실한 패턴만 넣는다(오탐보다 놓침이 낫다 — 걸린 글은 버려지지 않고 "사람 확인 대기"로 남는다).
//   앱스토어·구글 플레이(사용자 후기)에는 적용하지 않는다. 판정 문턱·킬스위치 감사 창은 건드리지 않는다.
//   정규식은 전부 경계가 있는 반복만 쓴다(10k자 글에서도 선형에 가깝게 — 셀프테스트가 시간을 잰다).
//
// 보고용: devAudienceReason(text, sourceKey) 가 패턴 id(예 'A-version-header')를 돌려준다. 첫 글자가 패턴 묶음(A~D)이다.
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다. `@/` 별칭·enum 을 쓰지 않는다. 셀프테스트 scripts/v71dm-selftest.mjs.

/** 이 가드를 적용하지 않는 소스(사용자 후기 — 오류 불평도 사용자 목소리다). */
export const DEV_AUDIENCE_EXEMPT_SOURCES: ReadonlySet<string> = new Set(['appstore', 'googleplay'])

/** C 묶음 문턱: 경로·파일명·Class::method·func() 토큰이 서로 다른 것으로 이만큼 이상이면 코드 분석 글로 본다. */
export const CODE_TOKEN_MIN = 3

/** D 묶음 문턱: 약한 운영 신호가 서로 다른 것으로 이만큼 이상이면 설치·운영 안내로 본다. */
export const OPS_SIGNAL_MIN = 2

// A — 포럼 버그 신고 양식 머리글. 하나만 있어도 양식이다.
const A_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  // "My Mautic version is" · "My PHP version is" · "My SuiteCRM 8 version is" (제품 이름 1~3 단어)
  ['A-version-header', /\bmy\s+(?:[\w.+-]+\s+){1,3}version\s+is\b/i],
  // 줄 하나가 "Your software" 뿐인 양식 머리글(문장 속 "your software is great" 는 아니다)
  ['A-header-line', /^[ \t]*your software[ \t]*:?[ \t]*$/im],
  ['A-search-first', /\bfirst,?\s+search\s+the\s+help\s+docs\s+and\s+this\s+forum\b/i],
]

// B — 버전 번호 + 고장 표현. 가격·평점·배율(4.99$, 4.5 stars, 2.5x, 3.5%)은 버전으로 안 센다.
const VERSION_TOKEN = /(?<![$€£₩\d.])\bv?\d{1,4}\.\d{1,4}(?:\.\d{1,4})?\b(?![.\d]|\s*(?:%|x\b|stars?\b|\/\s*(?:5|10)\b|usd\b|eur\b|dollars?\b|per\b|\/\s*mo))/i
const B_STRONG: ReadonlyArray<RegExp> = [/\bstack\s?trace\b/i, /\btraceback\b/i, /\bregression\b/i]
const B_WEAK: ReadonlyArray<RegExp> = [
  /\bfail(?:s|ed)?\s+to\b/i,
  /\bnot\s+working\s+(?:any\s?more\s+)?after\s+(?:the\s+)?(?:upgrade|update)\b/i,
  /\bafter\s+(?:upgrading|updating)\b/i,
  /\bbefore\s+v?\d{1,4}\.\d{1,4}\b/i,
  /\bsince\s+(?:version\s+|v)?\d{1,4}\.\d{1,4}\b/i,
  /\bbroke(?:n)?\s+in\s+v?\d{1,4}\.\d{1,4}\b/i,
]

// C — 소스·코드 분석.
const C_PHRASE = /\bI(?:'ve)?\s+(?:went|gone|looked|dug|read)\s+(?:through|at|into)\s+(?:the\s+|their\s+|its\s+)?(?:[\w-]+\s+){0,2}?(?:source(?:\s+code)?|code\s?base)\b/i
const URL = /\bhttps?:\/\/\S+/gi
const CODE_TOKENS: ReadonlyArray<RegExp> = [
  /\b[\w-]+(?:\/[\w.-]+){2,}/g, // 경로 a/b/c
  /\b[\w-]+\.(?:php|js|ts|tsx|py|java|rb|go|rs|yml|yaml|twig|tpl|cs|cpp|kt)\b/gi, // 파일명
  /\b[A-Z]\w*::\w+/g, // Class::method
  /\b[A-Za-z_]\w*\(\)/g, // func()
]

// D — 설치·운영 안내. 강한 표현은 하나로, 약한 신호는 서로 다른 것 2개 이상.
const D_STRONG: ReadonlyArray<RegExp> = [
  /\bnot\s+required\s+for\s+a\s+(?:normal\s+)?production\s+install(?:ation)?\b/i,
  /\bcomposer\s+(?:install|update|require)\b/i,
  /\bphp\s+bin\/console\b/i,
]
const D_WEAK: ReadonlyArray<readonly [string, RegExp]> = [
  ['local.php', /\blocal\.php\b/i],
  ['config-file', /\bconfig(?:uration)?\s+file\b/i],
  ['config.php', /\bconfig\.php\b/i],
  ['php.ini', /\bphp\.ini\b/i],
  ['npm-install', /\bnpm\s+(?:install|i|ci)\b/i],
  ['docker-compose', /\bdocker[\s-]compose\b/i],
  ['cron-job', /\bcron\s?jobs?\b/i],
  ['chmod', /\bchmod\b/i],
  ['apt-install', /\bapt(?:-get)?\s+install\b/i],
  ['htaccess', /\.htaccess\b/i],
]

/**
 * 개발자·관리자 대상 글이면 패턴 id, 아니면 null(순수·결정적).
 * 앱스토어·구글 플레이는 언제나 null. 글이 없으면 null — "글 못 읽음"은 내용 가드(passesRrV2ContentGuard)가 따로 막는다.
 */
export function devAudienceReason(text: string | null | undefined, sourceKey: string | null | undefined): string | null {
  if (typeof text !== 'string' || !text) return null
  if (DEV_AUDIENCE_EXEMPT_SOURCES.has(String(sourceKey ?? ''))) return null
  for (const [id, re] of A_PATTERNS) if (re.test(text)) return id
  if (VERSION_TOKEN.test(text)) {
    if (B_STRONG.some((re) => re.test(text))) return 'B-version-failure'
    if (B_WEAK.filter((re) => re.test(text)).length >= 2) return 'B-version-failure'
  }
  if (C_PHRASE.test(text)) return 'C-source-phrase'
  const noUrl = text.replace(URL, ' ')
  const tokens = new Set<string>()
  for (const re of CODE_TOKENS) for (const m of noUrl.match(re) ?? []) { tokens.add(m); if (tokens.size >= CODE_TOKEN_MIN) return 'C-code-tokens' }
  if (D_STRONG.some((re) => re.test(text))) return 'D-install-strong'
  if (D_WEAK.filter(([, re]) => re.test(text)).length >= OPS_SIGNAL_MIN) return 'D-ops-signals'
  return null
}
