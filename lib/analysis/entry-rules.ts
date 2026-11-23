// 소스별 입구 규칙(v71dx, 규칙 기반·결정적·순수) — 앱스토어 밖 소스(HN·포럼·YouTube)에서 "제품 판단 재료"가 되는 글만 통과시킨다.
//
// ⛔ 기본 꺼짐. ENTRY_RULES_ENABLED=true 일 때만 효과가 있다. ENTRY_RULES_SHADOW=true 면 판정은 계산·기록하되 승인을 바꾸지 않는다.
//    이 모듈은 승인 집합을 **좁히기만** 한다(통과 = 기존 동작 그대로, 막힘 = 승인하지 않고 사람 확인 대기).
//    기존 가드(dev-audience-guard A/C/D · applyApprovalGuard · AUTO_APPROVAL_SOURCES)는 바꾸지 않는다 — 그 뒤에서 한 번 더 거른다.
//
// 설계: reports/2026-11-23/v71dx-entry-rules-design.md. 점수는 "유형 신호"의 합이다(글 id·문장 암기 없음):
//   + 사용자 목소리(1인칭 사용·요청 양식) + 이유·사실(비교·가격·한계·이유 접속) + 사용 맥락(언제·어디서·워크플로)
//   + 제품 비중(이 제품을 예시가 아니라 주어로 말하고, 그 근처에 평가·사실이 있다)
//   − 개발자 대상(API·코드·서버 설정) − 설치·설정 절차 − 자기 플러그인 홍보
//   소스별 문턱(ENTRY_RULES.thresholds). github_issues 는 언제나 막는다. 표에 없는 소스(appstore·googleplay 등)는 적용 안 함(통과).
//
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다(절대 경로 import 가능). `@/` 별칭·enum 을 쓰지 않는다. import 없음.
//    셀프테스트 scripts/entry-rules-selftest.mjs · 리플레이 scripts/entry-rules-replay.mjs.
//    v71dy 보강(er-v1.2): entryVerdict 넷째 인자 EntryBoost — 기본(생략·전부 false)은 er-v1.1 그대로. 비교 scripts/entry-boost-compare.mjs.

export const ENTRY_RULES_VERSION = 'er-v1.1'

/** 글 앞에서 이만큼만 본다(dev-audience-guard 와 같은 이유 — 선형 시간·적대적 긴 글). */
export const ENTRY_MAX_SCAN = 8000

/** 직렬화 가능한 설정 한 벌(오케스트레이터가 JSON 으로 찍어 볼 수 있다). */
export const ENTRY_RULES = {
  version: ENTRY_RULES_VERSION,
  /** 중립 출발점. 신호가 하나도 없는 글이 놓이는 자리. */
  base: 30,
  weights: {
    userVoice: 15, userVoiceMax: 2,
    reasonFact: 12, reasonFactMax: 3,
    usageContext: 7, usageContextMax: 2,
    productAnchored: 15,
    productAbsent: -25,
    devPerToken: -8, devFree: 1, devMax: -48,
    codeSyntax: -10,
    installPerStep: -10, installFree: 1, installMax: -40,
    promo: -30,
  },
  /** 소스별 통과 문턱(점수 ≥ 문턱이면 통과). null = 언제나 막음. */
  thresholds: {
    hackernews: 50,
    suitecrm_community: 35,
    mautic_forum: 35,
    obsidian_forum: 35,
    youtube: 30,
    github_issues: null,
  } as Record<string, number | null>,
  /** HN 은 이 제품을 근처 평가·사실과 함께 말한 글만(제품이 지나가는 언급이면 점수와 무관하게 막음). */
  requireAnchoredMention: ['hackernews'] as string[],
  /**
   * 제품 비중(언급·부재)을 보는 소스 — 여러 제품이 섞이는 곳만. 단일 제품 포럼은 글이 그 제품 이야기라는 게 장소로 정해져 제품명을 안 쓴다.
   * YouTube 는 뺐다: 댓글은 영상(=제품 소개) 아래 달려 대명사("it")로 말하고, 발굴 프로젝트는 제품명이 없다 — 부재 감점이 좋은 댓글을 막는다.
   */
  productShareSources: ['hackernews'] as string[],
  /** 제품 언급 근처로 보는 거리(글자). */
  anchorWindow: 250,
}

export interface EntryVerdict {
  score: number | null
  pass: boolean
  reasons: string[]
  version: string
  /** 진단용 신호 개수. */
  features?: Record<string, number>
}

// ── 신호 정의(유형 단위) ──
type Pat = readonly [string, RegExp]

const USER_VOICE: Pat[] = [
  ['i-use', /\bI(?:'m|\s+am|'ve|\s+have|\s+had)?\s+(?:been\s+|also\s+|still\s+|just\s+)?(?:us(?:e|ed|ing)|tried|switched|moved|pay|paid|bought|subscribed?|rely|post|schedule|manage|track)\b/i],
  ['we-use', /\bwe(?:'ve|\s+have|\s+are)?\s+(?:been\s+|also\s+|still\s+)?(?:us(?:e|ed|ing)|tried|switched|moved|pay|paid|rely)\b/i],
  ['my-context', /\b(?:my|our)\s+(?:team|workflow|company|business|clients?|setup|vault|notes|account|campaigns?|channel|users|work)\b/i],
  ['i-want', /\bI(?:'d|\s+would)\s+(?:like|love|prefer|rather)\b|\bI\s+(?:want|need|wish)\b/i],
  ['request-form', /\buse case or problem\b|\bproposed solution\b|\bdescribe the solution\b|\bcurrent workaround\b|\bwould be (?:good|great|nice|useful|helpful) to have\b|\bplease (?:add|make|allow|support|consider)\b|\bmy idea is\b/i],
  ['users-have-to', /\busers?\s+(?:have|has|need|needs|must)\s+to\b|\busers?\s+(?:can'?t|cannot)\b/i],
  ['i-feel', /\bI\s+(?:really\s+)?(?:love|like|hate|prefer|recommend|find)\b|\b(?:fan of|switched (?:from|to))\b/i],
]

const REASON_FACT: Pat[] = [
  ['because', /\bbecause\b|\bso that\b|\bthat'?s why\b|\bwhich (?:means|is why)\b/i],
  ['compare', /\b(?:better|worse|cheaper|faster|slower|easier|harder|nicer|simpler)\s+than\b|\bvs\.?\s|\bversus\b|\bcompared (?:to|with)\b|\binstead of\b|\brather than\b|\b(?:rival(?:l?ed|s)?|alternative to|inferior|superior)\b/i],
  ['price', /\$\s?\d|\b\d+(?:\.\d+)?\s?(?:usd|dollars?|eur|euros?)\b|\b(?:price[ds]?|pricing|cheap|expensive|free|premium|paid|subscription|per (?:month|user|seat)|tier)\b/i],
  ['limit', /\b(?:doesn'?t|does not|don'?t|can'?t|cannot|won'?t|isn'?t)\s+(?:allow|support|let|read|return|handle|have|show|work|sync|do|offer)\b|\bno (?:way|option|setting|parameter|column|support)\b|\bthere(?:'s|\s+is|\s+are)\s+no\b|\b(?:limitations?|limited|lacking|lacks|missing)\b|\bonly (?:sets|works|supports|allows|shows|lets)\b|\bnot (?:possible|available|supported)\b/i],
  ['behaviour', /\b(?:changed|used to|now (?:shows|displays|marks|requires)|by default|defaults? to|displays? (?:as|differently))\b/i],
  ['evaluation', /\b(?:great|dope|perfect|terrible|awful|frustrating|annoying|best|worst|buggy|clunky|intuitive|reliable|helpful|useful|powerful|nice)\b/i],
]

const USAGE_CONTEXT: Pat[] = [
  ['when', /\bwhen(?:ever)?\b|\bevery time\b/i],
  ['platform', /\b(?:on|in)\s+(?:android|ios|iphone|ipad|mobile|desktop|mac|linux|windows|the phone|my phone)\b/i],
  ['workflow', /\bworkflow\b|\bmanaging\b|\bfor (?:my|our) (?:team|work|clients?|business|company)\b/i],
  ['frequency', /\b(?:daily|every day|once a (?:week|month)|each (?:week|month)|per week)\b/i],
]

const DEV: Pat[] = [
  ['api', /\bapi\b/i], ['endpoint', /\bendpoints?\b/i], ['oauth', /\boauth2?\b/i], ['http-status', /\bhttp\s?[45]\d\d\b/i],
  ['json', /\bjson\b/i], ['schema', /\bschema\b|\bdata model\b/i], ['db-table', /\b(?:database|db)\s+table\b|\baddress table\b|\b(?:separate|new|custom)\s+table\b/i],
  ['hook', /\blogic hooks?\b|\bhooks?\s+under\b/i], ['module', /\bcustom module\b|\bmodules?\s+(?:folder|directory)\b/i],
  ['webhook', /\bwebhooks?\b/i], ['php', /\bphp\b/i], ['webserver', /\bapache\b|\bnginx\b|\bsite conf\b/i],
  ['script', /\b(?:python|bash|shell|validation)\s+script\b/i], ['smtp', /\bsmtp\b|\bdsn\b/i], ['rest', /\brest\s+api\b/i],
  ['repo', /\bgithub\b|\brepo(?:sitory)?\b|\bpull request\b|\bcommit(?:ted)?\b/i], ['patch', /\bpatch(?:ed|ing)?\b|\bdebugg?(?:ing|er)?\b/i],
  ['callback', /\bcallbacks?\b/i], ['composer', /\bcomposer\b/i], ['docker', /\bdocker\b/i], ['migration', /\bmigrations?\b/i],
  ['core', /\bupgrade-safe\b|\bcore (?:files?|code|layout)\b|\bout of core\b/i], ['ext-folder', /\bextensions?\/|\bcustom\/extension\b/i],
  ['stack', /\bfront-?end\b|\bback-?end\b|\bserver-?side\b/i], ['code', /\bsource code\b|\bline (?:of|in the) code\b|\bthe code\b/i],
  ['bug-report', /\bbug report\b|\breport(?:ing)? the bug\b|\bopen (?:up )?(?:a|an) (?:bug|issue)\b/i], ['sql', /\bsql\b|\bquer(?:y|ies)\s+(?:the|a)\s+(?:db|database)\b/i],
]
// 코드 문법(글 안에 코드가 붙어 있다): 펜스 블록 · {...;} · <Tag> · $var · ->
const CODE_SYNTAX = /```|\{[^{}\n]{0,200};[^{}\n]{0,200}\}|<\/?[A-Z][A-Za-z]+[^>]{0,80}>|\$[a-z_]\w*\b|\w->\w/

const INSTALL: Pat[] = [
  ['download', /\bdownload(?:ed|ing)?\s+(?:it\s+)?(?:from|the)\b/i], ['install', /\binstall(?:ed|ing|ation)?\b/i], ['setup', /\bset(?:ting)?\s?up\b/i],
  ['releases', /\breleases page\b|\bf-droid\b|\.apk\b|\.zip\b/i], ['click', /\bclick(?:ing)?\s+(?:on\s+)?["“]/i], ['go-to', /\bgo to\b/i],
  ['then-step', /\b(?:then|after that|once)\s*,?\s+(?:you\s+)?(?:open|select|click|enter|run|connect|share|copy|add|configure)\b/i],
  ['enter-the', /\benter the\b/i], ['run-cmd', /\brun (?:the )?(?:command|following)\b|\bphp bin\/console\b/i], ['configure', /\bconfigur(?:e|ed|ing)\b/i],
]

const PROMO: Pat[] = [
  ['i-built', /\bI(?:'ve|\s+have)?\s+(?:developed|built|made|wrote|written|created|released|published)\s+(?:a|an|my|this|the)\s+(?:[\w-]+\s+){0,3}?(?:plugin|add-?on|extension|bundle|package|integration|tool|app|module|library)\b/i],
  ['author', /\bI'?m\s+the\s+(?:author|developer|maintainer|creator)\b|\(I'?m the author/i],
  ['disclosure', /\bdisclosure\b|\bwe build\b/i],
  ['my-plugin', /\b(?:my|our)\s+(?:plugin|add-?on|extension|bundle|package)\b|\bI needed a plugin\b/i],
  ['feedback-ask', /\bopen to suggestions\b|\bcheck out my\b|\bfeedback (?:is )?welcome\b|\bI plan to improve\b/i],
]

/** 예시로 든 언급("such as X", "something like X") — 제품 비중으로 세지 않는다. */
const EXAMPLE_BEFORE = /(?:such as|like|e\.g\.,?|for example,?|for instance,?|similar to|something like|or)\s+(?:the\s+|a\s+)?$/i

/** 흔한 영어 단어와 같은 제품명은 대문자로 쓴 것만 제품으로 본다("rev"·"draft" 오탐 방지). */
const COMMON_WORDS = new Set(['rev', 'draft', 'spinach', 'lavender', 'notion', 'monday', 'linear', 'bear', 'things', 'day', 'one', 'basecamp', 'loom', 'pitch', 'front', 'close', 'copper', 'spark', 'airtable', 'craft', 'reflect', 'obsidian', 'signal', 'zoom'])

/** 제품명으로 쓸 수 있는가(YouTube 의 'search-discovery marketing_automation' 같은 발굴 프로젝트 이름은 아니다). */
export function productLike(name: string | null | undefined): boolean {
  const s = String(name ?? '').trim()
  return s.length >= 2 && s.length <= 40 && !/[_]|search-discovery|^https?:/i.test(s)
}

function nameRegex(name: string): RegExp {
  const single = !/\s/.test(name.trim())
  const caseSensitive = single && COMMON_WORDS.has(name.trim().toLowerCase())
  const form = caseSensitive ? name.trim()[0].toUpperCase() + name.trim().slice(1) : name.trim()
  const esc = form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')
  return new RegExp(`(?<![\\w-])${esc}(?![\\w-])`, caseSensitive ? 'g' : 'gi')
}

/** 머리 꼬리표 "[HN: …]" "[YouTube 댓글 · …]" 는 수집기가 붙인 것이라 신호에서 뺀다(스레드 제목의 제품명은 글쓴이 말이 아니다). */
export function stripHeader(text: string): string {
  return text.replace(/^\s*\[[^\]\n]{0,300}\]\s*/, '')
}

const distinct = (pats: Pat[], t: string) => pats.filter(([, re]) => re.test(t)).map(([id]) => id)

export interface EntryFeatures {
  userVoice: string[]; reasonFact: string[]; usageContext: string[]; dev: string[]; codeSyntax: boolean; install: string[]; promo: string[]
  /** null = 제품명을 모르거나 제품명처럼 생기지 않았다(제품 비중 신호 없음). */
  mentions: number | null; exampleMentions: number; anchored: boolean
}

export function entryFeatures(raw: string, project?: string | null): EntryFeatures {
  const t = stripHeader(raw.slice(0, ENTRY_MAX_SCAN))
  const f: EntryFeatures = {
    userVoice: distinct(USER_VOICE, t), reasonFact: distinct(REASON_FACT, t), usageContext: distinct(USAGE_CONTEXT, t),
    dev: distinct(DEV, t), codeSyntax: CODE_SYNTAX.test(t), install: distinct(INSTALL, t), promo: distinct(PROMO, t),
    mentions: null, exampleMentions: 0, anchored: false,
  }
  if (productLike(project)) {
    const names = [String(project).trim()]
    const first = names[0].split(/\s+/)[0]
    if (names[0].includes(' ') && first.length >= 4 && !/^(?:when|the|my|get)$/i.test(first)) names.push(first) // "Workday HCM" → "Workday"
    let m = 0
    const seen = new Set<number>()
    for (const n of names) {
      for (const hit of t.matchAll(nameRegex(n))) {
        const at = hit.index ?? 0
        if (seen.has(at)) continue
        seen.add(at)
        if (EXAMPLE_BEFORE.test(t.slice(Math.max(0, at - 25), at))) { f.exampleMentions++; continue }
        m++
        const w = t.slice(Math.max(0, at - ENTRY_RULES.anchorWindow), at + n.length + ENTRY_RULES.anchorWindow)
        if (!f.anchored && (REASON_FACT.some(([, re]) => re.test(w)) || USER_VOICE.some(([, re]) => re.test(w)))) f.anchored = true
      }
    }
    f.mentions = m
  }
  return f
}

// ── v71dy 보강(er-v1.2) — 세 갈래, 각각 따로 켠다. 다 꺼져 있으면 er-v1.1 과 한 글자도 다르지 않은 판정을 낸다. ──
//   설계·비교표: reports/2026-11-23/v71dy-entry-boost.md. 낱말은 전부 "개념 묶음"(글 id·문장 없음).

export const ENTRY_RULES_VERSION_BOOST = 'er-v1.2'

/** 보강 스위치. 하나라도 true 면 판정 버전이 er-v1.2 다. */
export interface EntryBoost {
  /** (a) 답변·설정·개발 개념 묶음 감점(소스별 묶음 표). */
  setupPenalty?: boolean
  /** (b) 주제 관문: 글의 주제가 이 제품인가, 다른 주제 안을 지나가는가(HN). */
  topicGate?: boolean
  /** (c) 제품명 문장 창: 제품명이 든 문장 앞뒤 3문장에서만 제품 판단(한계·이유·사실)을 찾는다(HN). */
  nameWindow?: boolean
}

/** 고른 변형(오케스트레이터가 이 객체를 그대로 넘긴다). 근거: 설계 문서 §4. */
export const ENTRY_BOOST_CHOSEN: EntryBoost = Object.freeze({ setupPenalty: true, topicGate: true, nameWindow: true })

export const ENTRY_BOOST = {
  /** (a) 묶음 하나당 감점. 기존 개발 낱말 하나 값(−8)과 같은 크기 — "기술 개념 하나 = 개발 낱말 하나". */
  setupPerFamily: -8, setupMax: -32,
  /** (a) 자기 제작 알림(HN) = 기존 홍보와 같은 판단이라 같은 값. 홍보가 이미 걸렸으면 겹쳐 세지 않는다. */
  selfBuild: -30,
  /** (b) 주제가 약하면: 제품 근처 가점(+15) + 이유·사실 하나(+12)를 지운다 — 제품 근접만으로는 통과하지 못하게. */
  topicWeak: -27,
  /** (b) 제품명이 든 문장이 이 비율 미만이고, 제목·첫 문장에도 없으면 주제가 약하다. */
  topicShareMin: 1 / 3,
  /** (c) 창 크기(문장) · 창 안에 판단이 없으면 제품 없음(−25)과 같은 값 — "판단 없는 언급 = 언급 없음". */
  windowSentences: 3, windowNoJudgement: -25,
  /** 보강을 보는 소스. 유튜브는 출발점=문턱이라 감점 하나가 곧 막음이고 라벨 오류가 0건이라 넣지 않는다. */
  setupFamiliesBySource: {
    hackernews: ['dev-tooling'],
    suitecrm_community: ['config-file', 'runtime-ops', 'diagnostic-list', 'plugin-dev', 'data-arch', 'design-proposal'],
    mautic_forum: ['config-file', 'runtime-ops', 'diagnostic-list', 'plugin-dev', 'data-arch', 'design-proposal'],
    // 옵시디언은 플러그인·설정 이야기가 곧 사용자 이야기(커뮤니티 플러그인)라 plugin-dev·data-arch·design-proposal 을 뺀다.
    obsidian_forum: ['config-file', 'runtime-ops', 'diagnostic-list'],
  } as Record<string, string[]>,
  selfBuildSources: ['hackernews'] as string[],
}

const SETUP_FAMILIES: Record<string, RegExp> = {
  // 개발 도구(HN): 브라우저 개발자 도구·코드 편집기·터미널 — 제품을 쓰는 사람이 아니라 만지는 사람의 말
  'dev-tooling': /\bdev(?:eloper)?\s?tools\b|\bdevtools\b|\bcode editor\b|\bIDE\b|\bterminal\b|\bCLI\b|\bbrowser console\b|\bthe console\b/,
  // 설정 파일: 확장자 붙은 파일명·config 파일·컴파일된 파일·파일 권한
  'config-file': /\b[\w-]+\.(?:php|ini|ya?ml|env|conf|htaccess|xml|log|tpl)\b|\bconfig(?:uration)? files?\b|\bcompiled\b[^.]{0,25}\bfiles?\b|\bfile permissions?\b/i,
  // 운영 작업: 크론·세션·캐시·권한 명령·복구/재빌드·강제 새로고침·큐/워커·로그·서비스 재시작
  'runtime-ops': /\bcron(?:job|tab)?s?\b|\bsessions?\b|\bcache\b|\bchmod\b|\bchown\b|\bquick repair\b|\brebuild\b|\bctrl\s?\+\s?f5\b|\bhard refresh\b|\bqueues?\b|\bworkers?\b|\berror logs?\b|\blog files?\b|\brestart (?:the )?(?:server|service|apache|php)\b/i,
  // 진단 목록: "이 설정을 확인하라" 류 — 답변자가 남의 설치를 점검시키는 말
  'diagnostic-list': /\bcheck (?:these|the following|your|that|if|whether)\b|\bmake sure (?:that )?\w|\bhave you (?:checked|tried|enabled|cleared)\b|\btry (?:clearing|running|checking|disabling|enabling|setting)\b|\bverify (?:that|the|your)\b/i,
  // 플러그인 개발(단일 제품 CRM 포럼): 플러그인·모듈을 만드는/고치는 이야기, 기술 생태계 열거
  'plugin-dev': /\b(?:plugins?|modules?|extensions?|bundles?)\b[^.]{0,30}\b(?:develop(?:ment|ers?)?|build(?:ing)?|code|hooks?|overrides?)\b|\bcustom (?:plugins?|modules?)\b|\bplugins?, modules?\b|\bmodules?, (?:and )?plugins?\b/i,
  // 데이터 구조: 저장 방식·관계·정규화 — 기존 개발 낱말(schema·db table)과 겹치지 않는 쪽만
  'data-arch': /\bstorage\b|\bstored in\b|\brelationships?\b|\bnormali[sz]\w*\b|\bforeign keys?\b|\bentit(?:y|ies)\b/i,
  // 설계 제안(개발자 글 양식): proposal·rethinking·architecture·scalability. 요청 양식의 "Proposed solution" 은 제외
  'design-proposal': /\bproposal\b|\bproposed (?:enhancement|change|design|architecture)\b|\brethinking\b|\barchitecture\b|\bscalab(?:le|ility)\b/i,
}
/** 자기 제작 알림(HN): "만들고 있다·의견 달라·우리 제품". 기존 PROMO 가 못 잡는 짧은 형태. */
const SELF_BUILD = /\b(?:I'?m|we'?re|I am|we are)\s+(?:building|working on|making|launching)\b|^\s*building an?\b|\blet me know (?:your|what you)\b|\(?our product\)?|\b(?:I|we) (?:just )?(?:made|launched|shipped) (?:a|an|this|my|our)\b/im

/** 문장 나누기(마침표·물음표·느낌표 뒤 공백, 줄바꿈). URL 안의 점은 뒤에 공백이 없어 안 끊긴다. */
export function sentences(t: string): string[] {
  return t.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean)
}

/**
 * 보강용 언급 판정. er-v1.1 의 예시 판정에 두 개념을 더한다:
 *  ① "I like X" 의 like 는 동사(예시가 아니다) — 주어·부사 뒤 like 는 예시로 보지 않는다
 *  ② 열거 속 언급("X/Y", "(A, X, etc)", "similar service is X", "alternative is X") = 예시
 */
const EXAMPLE_BEFORE_V2 = /(?:such as|(?<!\b(?:I|we|you|they|really|also|would|'d|do|don'?t|didn'?t|not|still)\s)like|e\.g\.,?|for example,?|for instance,?|similar to|something like|\bor|similar \w+ (?:is|are)[^.]{0,40}|alternatives? (?:is|are|include)[^.]{0,20}|\/)\s*(?:the\s+|a\s+)?$/i
const ENUM_AFTER = /^\s*\/|^[^.()]{0,40}\betc\b/i

function nameHits(t: string, project: string): number[] {
  const names = [project.trim()]
  const first = names[0].split(/\s+/)[0]
  if (names[0].includes(' ') && first.length >= 4 && !/^(?:when|the|my|get)$/i.test(first)) names.push(first)
  const out = new Set<number>()
  for (const n of names) {
    for (const hit of t.matchAll(nameRegex(n))) {
      const at = hit.index ?? 0
      if (EXAMPLE_BEFORE_V2.test(t.slice(Math.max(0, at - 60), at))) continue
      if (ENUM_AFTER.test(t.slice(at + hit[0].length, at + hit[0].length + 45))) continue
      out.add(at)
    }
  }
  return [...out]
}

/** (c) 판단 낱말 확장: 기존 이유·사실·목소리 + 평가·고장·변화 개념. */
const JUDGE_EXT: RegExp[] = [
  /\b(?:fantastic|excellent|amazing|awesome|solid|stable|unstable|crash(?:es|ed|ing)?|broken|bloat(?:ed)?|superficial|disappointing|disappointed|confusing|lifesaver|indispensable|steep|overpriced|worth|sucks?|slow|janky|polished|enjoy(?:ed)?|loved?|hated?|favou?rite|pain)\b/i,
  /\b(?:removed|deprecated|discontinued|regression|unmaintained|went up|no longer|stopped working)\b/i,
  /\bjust works\b|\bworks (?:well|fine|great)\b/i,
]
const judged = (s: string) => REASON_FACT.some(([, re]) => re.test(s)) || USER_VOICE.some(([, re]) => re.test(s)) || JUDGE_EXT.some((re) => re.test(s))

/** (b) 글이 다른 대상(글쓴이의 기사·프로젝트·출시)에게 말하고 있다는 표지. */
const ADDRESSING_OTHER = /\bthis (?:article|post|essay)\b|\byour (?:app|project|product|tool|idea|startup|launch|site)\b|\bcongrat(?:s|ulations)\b/i

export interface BoostFeatures {
  setupFamilies: string[]; selfBuild: boolean
  /** 보강 판정의 제품 언급 문장 수 / 전체 문장 수. null = 제품명 없음·HN 아님. */
  nameSentences: number | null; totalSentences: number
  titleNames: boolean; firstSentenceNames: boolean; addressingOther: boolean; topicWeak: boolean
  windowJudged: boolean
  /** (c) 창 안에서 확장 판단 낱말(평가·고장·변화)이 나왔다 — 기존 이유·사실과 같은 값으로 센다(2차 조정). */
  windowExt: boolean
}

export function boostFeatures(raw: string, sourceKey: string, project?: string | null): BoostFeatures {
  const scan = raw.slice(0, ENTRY_MAX_SCAN)
  const t = stripHeader(scan)
  const fams = ENTRY_BOOST.setupFamiliesBySource[sourceKey] ?? []
  const f: BoostFeatures = {
    setupFamilies: fams.filter((k) => SETUP_FAMILIES[k].test(t)),
    selfBuild: ENTRY_BOOST.selfBuildSources.includes(sourceKey) && SELF_BUILD.test(t),
    nameSentences: null, totalSentences: 0, titleNames: false, firstSentenceNames: false, addressingOther: false, topicWeak: false, windowJudged: false, windowExt: false,
  }
  if (!ENTRY_RULES.productShareSources.includes(sourceKey) || !productLike(project)) return f
  const p = String(project)
  const ss = sentences(t)
  const hitIdx = new Set<number>()
  ss.forEach((s, i) => { if (nameHits(s, p).length) hitIdx.add(i) })
  // 머리 꼬리표 "[HN: 스레드 제목 · …]" 의 제목 — 신호로는 안 세지만, 스레드 주제가 이 제품인지 아는 데는 쓴다.
  const title = (scan.match(/^\s*\[[^\]\n]{0,300}\]/)?.[0] ?? '').replace(/^\s*\[(?:HN:)?\s*/, '').split(' · ')[0]
  f.nameSentences = hitIdx.size
  f.totalSentences = ss.length
  f.titleNames = !!title && nameRegex(p).test(title)
  f.firstSentenceNames = hitIdx.has(0)
  f.addressingOther = ADDRESSING_OTHER.test(t)
  f.topicWeak = hitIdx.size > 0 && !f.titleNames && (
    f.addressingOther || (!f.firstSentenceNames && hitIdx.size / Math.max(1, ss.length) < ENTRY_BOOST.topicShareMin)
  )
  const W = ENTRY_BOOST.windowSentences
  for (const i of hitIdx) {
    const win = ss.slice(Math.max(0, i - W), i + W + 1).join(' ')
    if (judged(win)) f.windowJudged = true
    if (JUDGE_EXT.some((re) => re.test(win))) f.windowExt = true
  }
  return f
}

const OFF: EntryVerdict = { score: null, pass: true, reasons: ['source-not-covered'], version: ENTRY_RULES_VERSION }

/**
 * 입구 규칙 판정(순수·결정적). 표에 없는 소스는 적용하지 않는다(pass, score null). github_issues 는 언제나 막는다.
 * 글이 없으면 막는다 — "글 못 읽음"을 통과로 접지 않는다(§7.1). 승인 집합을 좁히기만 하므로 막는 쪽이 안전하다.
 */
export function entryVerdict(text: string | null | undefined, sourceKey: string | null | undefined, project?: string | null, boost?: EntryBoost | null): EntryVerdict {
  const B = { setupPenalty: boost?.setupPenalty === true, topicGate: boost?.topicGate === true, nameWindow: boost?.nameWindow === true }
  const anyBoost = B.setupPenalty || B.topicGate || B.nameWindow
  const version = anyBoost ? ENTRY_RULES_VERSION_BOOST : ENTRY_RULES_VERSION
  const src = String(sourceKey ?? '')
  if (!Object.hasOwn(ENTRY_RULES.thresholds, src)) return anyBoost ? { ...OFF, version } : OFF
  const th = ENTRY_RULES.thresholds[src]
  if (th === null) return { score: 0, pass: false, reasons: [`${src}: always-block`], version }
  if (typeof text !== 'string' || !text.trim()) return { score: 0, pass: false, reasons: ['no-text'], version }
  const f = entryFeatures(text, project)
  const bf = anyBoost ? boostFeatures(text, src, project) : null
  // (c) 켜짐이면 제품 언급·근처 판단을 문장 창 판정으로 바꾼다(제품명 있는 HN 만 — 그 밖은 bf.nameSentences 가 null).
  const useWindow = B.nameWindow && bf !== null && bf.nameSentences !== null
  const mentions = useWindow ? bf!.nameSentences : f.mentions
  const anchored = useWindow ? bf!.windowJudged : f.anchored
  const W = ENTRY_RULES.weights
  const parts: [string, number][] = []
  const add = (k: string, v: number) => { if (v !== 0) parts.push([k, v]) }
  add(`user-voice(${f.userVoice.join(',')})`, Math.min(f.userVoice.length, W.userVoiceMax) * W.userVoice)
  add(`reason-fact(${f.reasonFact.join(',')})`, Math.min(f.reasonFact.length, W.reasonFactMax) * W.reasonFact)
  add(`usage(${f.usageContext.join(',')})`, Math.min(f.usageContext.length, W.usageContextMax) * W.usageContext)
  // (c) 2차 조정: 창 안의 확장 판단(평가·고장·변화)도 제품 판단 재료다 — 기존 이유·사실 종류 하나와 같은 값(상한 3종 안에서).
  if (useWindow && bf!.windowExt && f.reasonFact.length < W.reasonFactMax) add('reason-fact(window-ext)', W.reasonFact)
  if (mentions !== null && ENTRY_RULES.productShareSources.includes(src)) {
    if (mentions === 0) add(useWindow ? 'product-absent(window)' : `product-absent(example ${f.exampleMentions})`, W.productAbsent)
    else if (anchored) add(useWindow ? `product-window-judged(${mentions})` : `product-anchored(${mentions})`, W.productAnchored)
    else if (useWindow) add('window-no-judgement', ENTRY_BOOST.windowNoJudgement)
  }
  add(`dev(${f.dev.join(',')})`, Math.max(W.devMax, Math.max(0, f.dev.length - W.devFree) * W.devPerToken))
  if (f.codeSyntax) add('code-syntax', W.codeSyntax)
  add(`install(${f.install.join(',')})`, Math.max(W.installMax, Math.max(0, f.install.length - W.installFree) * W.installPerStep))
  if (f.promo.length) add(`promo(${f.promo.join(',')})`, W.promo)
  if (bf && B.setupPenalty) {
    // 기존 개발·설치 낱말이 하나도 없을 때만 묶음 하나를 봐준다("하나는 봐준다" 규칙을 한 번만 쓴다).
    const free = f.dev.length + f.install.length === 0 ? 1 : 0
    add(`setup(${bf.setupFamilies.join(',')})`, Math.max(ENTRY_BOOST.setupMax, Math.max(0, bf.setupFamilies.length - free) * ENTRY_BOOST.setupPerFamily))
    if (bf.selfBuild && !f.promo.length) add('self-build', ENTRY_BOOST.selfBuild)
  }
  if (bf && B.topicGate && bf.topicWeak) add(`topic-weak(${bf.nameSentences}/${bf.totalSentences}${bf.addressingOther ? ',addressing-other' : ''})`, ENTRY_BOOST.topicWeak)
  const score = Math.max(0, Math.min(100, ENTRY_RULES.base + parts.reduce((s, [, v]) => s + v, 0)))
  const reasons: string[] = []
  let pass = score >= th
  if (!pass) reasons.push(`score ${score} < ${th}`)
  if (ENTRY_RULES.requireAnchoredMention.includes(src) && mentions !== null && !(mentions > 0 && anchored)) {
    pass = false
    reasons.push(mentions === 0 ? 'passing-mention: product not discussed' : 'passing-mention: no judgement near product')
  }
  reasons.push(...parts.map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`))
  const features: Record<string, number> = { userVoice: f.userVoice.length, reasonFact: f.reasonFact.length, usageContext: f.usageContext.length, dev: f.dev.length, codeSyntax: f.codeSyntax ? 1 : 0, install: f.install.length, promo: f.promo.length, mentions: f.mentions ?? -1, anchored: f.anchored ? 1 : 0 }
  if (bf) Object.assign(features, { setupFamilies: bf.setupFamilies.length, selfBuild: bf.selfBuild ? 1 : 0, nameSentences: bf.nameSentences ?? -1, topicWeak: bf.topicWeak ? 1 : 0, windowJudged: bf.windowJudged ? 1 : 0, windowExt: bf.windowExt ? 1 : 0 })
  return { score, pass, reasons, version, features }
}

export type EntryMode = 'off' | 'shadow' | 'enforce'

/** ENTRY_RULES_ENABLED='true' 가 아니면 off. 켜져 있고 ENTRY_RULES_SHADOW='true' 면 shadow(기록만). */
export function entryRulesMode(env: Record<string, string | undefined> | null | undefined): EntryMode {
  const on = (v: unknown) => String(v ?? '').trim().toLowerCase() === 'true'
  if (!env || !on(env.ENTRY_RULES_ENABLED)) return 'off'
  return on(env.ENTRY_RULES_SHADOW) ? 'shadow' : 'enforce'
}

/** competitor_url 에서 제품명 후보(호스트 첫 마디). 스토어·코드 호스팅 주소면 null(제품명이 아니다). */
export function productNameFromUrl(url: string | null | undefined): string | null {
  try {
    const h = new URL(String(url ?? '')).hostname.toLowerCase().replace(/^www\./, '')
    if (/(?:^|\.)(?:apple\.com|google\.com|github\.com|gitlab\.com|youtube\.com|ycombinator\.com)$/.test(h)) return null
    const label = h.split('.')[0]
    return label && label.length >= 2 ? label : null
  } catch { return null }
}
