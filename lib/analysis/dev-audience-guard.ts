// 개발자·관리자 대상 글 가드(v71dm, 규칙 기반·결정적) — rr-v2 자동 승인 범위를 **좁히기만** 한다.
//
// 왜: 2026-11-23 자동 승인 2,000건 중 사람 채점 30건에서 오류 7건이 전부 hackernews·포럼(suitecrm_community·obsidian_forum·
//   mautic_forum)에서 나왔다(앱스토어·구글 플레이 0건). 오류 글의 공통점은 "사용자의 목소리"가 아니라 개발자·관리자에게 하는 말이었다:
//   포럼 버그 신고 양식, 버전+고장 보고, 소스 코드 분석, 설치·운영 안내.
//
// 원칙: 확실한 패턴만 넣는다(오탐보다 놓침이 낫다 — 걸린 글은 버려지지 않고 "사람 확인 대기"로 남는다).
//   앱스토어·구글 플레이(사용자 후기)에는 적용하지 않는다. 판정 문턱·킬스위치 감사 창은 건드리지 않는다.
//   끄는 스위치는 없다(설계) — 되돌리려면 PR revert.
//   성능: 글 앞 MAX_SCAN_CHARS(8,000자)만 본다. 토큰 정규식은 단어 시작에서만 출발(lookbehind)해 긴 단어에서도 선형이다
//   (셀프테스트가 'a-'×10000 같은 적대적 글로 시간을 잰다).
//
// 보고용: devAudienceReason(text, sourceKey) 가 패턴 id(예 'A-version-header')를 돌려준다. 첫 글자가 패턴 묶음(A~D)이다.
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다. `@/` 별칭·enum 을 쓰지 않는다. 셀프테스트 scripts/v71dm-selftest.mjs.

/** 이 가드를 적용하지 않는 소스(사용자 후기 — 오류 불평도 사용자 목소리다). */
export const DEV_AUDIENCE_EXEMPT_SOURCES: ReadonlySet<string> = new Set(['appstore', 'googleplay'])

/** 글 앞에서 이만큼만 본다(양식 머리글·코드 토큰은 앞에 나온다). 뒤쪽만 개발자 글인 긴 글은 놓친다 — 의도된 보수. */
export const MAX_SCAN_CHARS = 8000

/** C 묶음 문턱: 경로·파일명·Class::method·func() 토큰이 서로 다른 것으로 이만큼 이상이면 코드 분석 글로 본다. */
export const CODE_TOKEN_MIN = 3

/** D 묶음 문턱: 약한 운영 신호가 서로 다른 것으로 이만큼 이상이면 설치·운영 안내로 본다. */
export const OPS_SIGNAL_MIN = 3

// A — 포럼 버그 신고 양식 머리글. "My <제품> version is" 는 콜론이 붙거나 두 번 이상 나올 때만(일반 문장 "My favorite version is the old one" 제외).
const A_VERSION_LINE = /\bmy\s+(?:[\w.+-]+\s+){1,3}version\s+is\b/gi
const A_VERSION_COLON = /\bmy\s+(?:[\w.+-]+\s+){1,3}version\s+is[ \t]*:/i
const A_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  // 줄 하나가 "Your software" 뿐인 양식 머리글(문장 속 "your software is great" 는 아니다)
  ['A-header-line', /^[ \t]*your software[ \t]*:?[ \t]*$/im],
]
// 양식 안내문 "First, search the help docs and this forum" — 머리글만으로는 걸지 않는다(v71dp 남헌 결정: 양식만 쓴 사용자 글이 막혔다).
//   같은 글에 버전 표지(아래 VERSION_TOKEN, B 와 같은 정의) ∧ 고장 표현(A_FAILURE)이 둘 다 있을 때만(버그 신고) 'A-search-first'.
const A_SEARCH_FIRST = /\bfirst,?\s+search\s+the\s+help\s+docs\s+and\s+this\s+forum\b/i
// 고장 표현 — 짧고 보수적인 목록(대소문자 무시·단어 경계). 이 머리글과 함께일 때만 쓴다.
const A_FAILURE = /\b(?:fail(?:s|ed)?\s+to|does(?:n't|\s+not)\s+work|not\s+working|broken|errors?|crash(?:es|ed|ing)?|exceptions?|wrong|bugs?|regression|stack\s?trace|can't|cannot|unable\s+to)(?![\w'])/i

// B — 진짜 버전 표지 + 고장 표현. 버전 표지 = v 접두(v2.1) · 세 마디(2.14.1, 각 1~3자리 — 날짜 23.11.2026 제외) ·
//   바로 앞에 version/upgrade/update/release 낱말(“upgraded to 5.3”). 가격·평점(4.99 to 9.99, 4.5 stars)은 버전이 아니다.
const VERSION_TOKEN = /(?<![\w.])v\d{1,3}\.\d{1,3}(?:\.\d{1,3})?(?![\w.])|(?<![\w.])\d{1,3}\.\d{1,3}\.\d{1,3}(?![\w.])|\b(?:version|upgrade[ds]?|upgrading|update[ds]?|updating|release[ds]?)\s+(?:to\s+)?v?\d{1,3}\.\d{1,3}(?:\.\d{1,3})?(?![\w.])/i
const B_STRONG: ReadonlyArray<RegExp> = [/\bstack\s?trace\b/i, /\btraceback\b/i]
const B_WEAK: ReadonlyArray<RegExp> = [
  /\bfail(?:s|ed)?\s+to\b/i,
  /\bnot\s+working\s+(?:any\s?more\s+)?after\s+(?:the\s+)?(?:upgrade|update)\b/i,
  /\bafter\s+(?:upgrading|updating)\b/i,
  /\bregression\b/i,
  /\bbefore\s+v?\d{1,3}\.\d{1,3}\b/i,
  /\bsince\s+(?:version\s+|v)?\d{1,3}\.\d{1,3}\b/i,
  /\bbroke(?:n)?\s+in\s+v?\d{1,3}\.\d{1,3}\b/i,
]

// C — 소스·코드 분석.
const C_PHRASE = /\bI(?:'ve)?\s+(?:went|gone|looked|dug|read)\s+(?:through|at|into)\s+(?:the\s+|their\s+|its\s+)?(?:[\w-]+\s+){0,2}?(?:source(?:\s+code)?|code\s?base)\b/i
const URL = /\bhttps?:\/\/\S+/gi
// 단어 시작에서만 출발한다((?<![\w-]) 등) — 'a-a-a-…' 같은 긴 글에서 위치마다 다시 훑는 이차 시간을 막는다.
const CODE_TOKENS: ReadonlyArray<RegExp> = [
  /(?<![\w./-])[\w-]+(?:\/[\w.-]+){2,}/g, // 경로 a/b/c — 글자가 없는 토큰(날짜 11/23/2026)은 아래에서 뺀다
  /(?<![\w.-])[\w-]+\.(?:php|js|ts|tsx|py|java|rb|go|rs|yml|yaml|twig|tpl|cs|cpp|kt)(?![\w.])/gi, // 파일명
  /(?<!\w)[A-Z]\w*::\w+/g, // Class::method
  /(?<!\w)[A-Za-z_]\w*\(\)/g, // func()
]

// D — 설치·운영 안내. 강한 표현은 하나로, 약한 신호는 서로 다른 것 3개 이상.
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
 * 개발자·관리자 대상 글이면 패턴 id, 아니면 null(순수·결정적). 글 앞 MAX_SCAN_CHARS 자만 본다.
 * 앱스토어·구글 플레이는 언제나 null. 글이 없으면 null — "글 못 읽음"은 내용 가드(passesRrV2ContentGuard)가 따로 막는다.
 */
export function devAudienceReason(raw: string | null | undefined, sourceKey: string | null | undefined): string | null {
  if (typeof raw !== 'string' || !raw) return null
  if (DEV_AUDIENCE_EXEMPT_SOURCES.has(String(sourceKey ?? ''))) return null
  const text = raw.slice(0, MAX_SCAN_CHARS)
  if (A_VERSION_COLON.test(text) || (text.match(A_VERSION_LINE) ?? []).length >= 2) return 'A-version-header'
  for (const [id, re] of A_PATTERNS) if (re.test(text)) return id
  if (A_SEARCH_FIRST.test(text) && VERSION_TOKEN.test(text) && A_FAILURE.test(text)) return 'A-search-first'
  if (VERSION_TOKEN.test(text)) {
    if (B_STRONG.some((re) => re.test(text))) return 'B-version-failure'
    if (B_WEAK.filter((re) => re.test(text)).length >= 2) return 'B-version-failure'
  }
  if (C_PHRASE.test(text)) return 'C-source-phrase'
  const noUrl = text.replace(URL, ' ')
  const tokens = new Set<string>()
  for (const re of CODE_TOKENS) {
    for (const m of noUrl.match(re) ?? []) {
      if (!/[A-Za-z]/.test(m)) continue // 날짜·숫자만인 토큰은 코드가 아니다
      tokens.add(m)
      if (tokens.size >= CODE_TOKEN_MIN) return 'C-code-tokens'
    }
  }
  if (D_STRONG.some((re) => re.test(text))) return 'D-install-strong'
  if (D_WEAK.filter(([, re]) => re.test(text)).length >= OPS_SIGNAL_MIN) return 'D-ops-signals'
  return null
}
