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

const OFF: EntryVerdict = { score: null, pass: true, reasons: ['source-not-covered'], version: ENTRY_RULES_VERSION }

/**
 * 입구 규칙 판정(순수·결정적). 표에 없는 소스는 적용하지 않는다(pass, score null). github_issues 는 언제나 막는다.
 * 글이 없으면 막는다 — "글 못 읽음"을 통과로 접지 않는다(§7.1). 승인 집합을 좁히기만 하므로 막는 쪽이 안전하다.
 */
export function entryVerdict(text: string | null | undefined, sourceKey: string | null | undefined, project?: string | null): EntryVerdict {
  const src = String(sourceKey ?? '')
  if (!Object.hasOwn(ENTRY_RULES.thresholds, src)) return OFF
  const th = ENTRY_RULES.thresholds[src]
  if (th === null) return { score: 0, pass: false, reasons: [`${src}: always-block`], version: ENTRY_RULES_VERSION }
  if (typeof text !== 'string' || !text.trim()) return { score: 0, pass: false, reasons: ['no-text'], version: ENTRY_RULES_VERSION }
  const f = entryFeatures(text, project)
  const W = ENTRY_RULES.weights
  const parts: [string, number][] = []
  const add = (k: string, v: number) => { if (v !== 0) parts.push([k, v]) }
  add(`user-voice(${f.userVoice.join(',')})`, Math.min(f.userVoice.length, W.userVoiceMax) * W.userVoice)
  add(`reason-fact(${f.reasonFact.join(',')})`, Math.min(f.reasonFact.length, W.reasonFactMax) * W.reasonFact)
  add(`usage(${f.usageContext.join(',')})`, Math.min(f.usageContext.length, W.usageContextMax) * W.usageContext)
  if (f.mentions !== null && ENTRY_RULES.productShareSources.includes(src)) {
    if (f.mentions === 0) add(`product-absent(example ${f.exampleMentions})`, W.productAbsent)
    else if (f.anchored) add(`product-anchored(${f.mentions})`, W.productAnchored)
  }
  add(`dev(${f.dev.join(',')})`, Math.max(W.devMax, Math.max(0, f.dev.length - W.devFree) * W.devPerToken))
  if (f.codeSyntax) add('code-syntax', W.codeSyntax)
  add(`install(${f.install.join(',')})`, Math.max(W.installMax, Math.max(0, f.install.length - W.installFree) * W.installPerStep))
  if (f.promo.length) add(`promo(${f.promo.join(',')})`, W.promo)
  const score = Math.max(0, Math.min(100, ENTRY_RULES.base + parts.reduce((s, [, v]) => s + v, 0)))
  const reasons: string[] = []
  let pass = score >= th
  if (!pass) reasons.push(`score ${score} < ${th}`)
  if (ENTRY_RULES.requireAnchoredMention.includes(src) && f.mentions !== null && !(f.mentions > 0 && f.anchored)) {
    pass = false
    reasons.push(f.mentions === 0 ? 'passing-mention: product not discussed' : 'passing-mention: no judgement near product')
  }
  reasons.push(...parts.map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`))
  const features = { userVoice: f.userVoice.length, reasonFact: f.reasonFact.length, usageContext: f.usageContext.length, dev: f.dev.length, codeSyntax: f.codeSyntax ? 1 : 0, install: f.install.length, promo: f.promo.length, mentions: f.mentions ?? -1, anchored: f.anchored ? 1 : 0 }
  return { score, pass, reasons, version: ENTRY_RULES_VERSION, features }
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
