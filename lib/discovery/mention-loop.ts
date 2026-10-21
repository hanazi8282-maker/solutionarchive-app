// 리뷰 속 언급 앱 → 새 앱 후보 루프(남헌 v71ad §1, D-36). 순수 함수만 — 네트워크·DB·파일 없음.
// 설계: reports/2026-10-17/mention-loop-design.md. 실행기: scripts/mention-loop.mjs(dry-run, 입력은 읽기 SQL 결과 JSON).
//
// 단계: ① 언급 추출(대안·갈아탐·비교 사전, 대안 탐색 글 표시) ② 이름 정리·등록분 대조 ③ 후보 대장(글·소스·근거 id)
//       ④ 오탐 거르기(일반명사·회사명·사람·자기 이름·비교만) ⑤ 앱 검증(anchor.ts verifyAnchor 재사용)
//       ⑦ 30% 게이트(target-supply.ts gateHeadroom 재사용) ⑨ 일일 지표 한 줄 ⑩ 안전 경보.
// 기존 product-name-candidates.mjs 의 넓은 추출(문장 중간 대문자 전부)과 달리 **전환·대안 문맥 안의 이름만** 잡는다 — 사람 승인 없이
// 돌릴 경로라 정밀도를 우선한다. 정규화·등록 사전은 그 스크립트 것을 그대로 쓴다(키가 갈라지면 같은 앱이 두 번 오른다).
// v71aj 발전 5안(설계 reports/2026-10-17/mention-loop-v71aj.md): (가) filterPool (나) parseCriterion·compareCriteria·표본 (다) mergeSimilar·toGeneratorCandidates
//   (라) applyAreaVerdicts (마) reviewGate — 전부 순수 함수, 등록은 여전히 마이그 초안 경로뿐.

import { buildRegistry as buildRegistryJs, normKey, stripHeader } from '../../scripts/product-name-candidates.mjs'
import { verifyAnchor, type AnchorVerdict } from '../review/anchor.ts'
import { gateHeadroom } from '../review/target-supply.ts'
import { effectiveArea, latestByInput } from '../analysis/area-reclass.ts'
import type { Candidate } from './candidate-generator.ts'

// JS 기본값(= [])이 never[] 로 추론돼 타입이 막힌다 — 받는 꼴만 넓힌다.
const buildRegistry = buildRegistryJs as (x: Record<string, unknown>) => Map<string, string>

/** 기본 통과 기준: 서로 다른 글 수. 데이터로 조정한다(thresholdTable). */
export const MIN_POSTS_DEFAULT = 3
/** 영역 적합: 근거 글 중 대표 영역 비중 하한(지시 "영역 적합 90%+"). */
export const AREA_FIT_MIN = 0.9
/** 영역 쏠림 경보: 등록 가능 후보 중 한 영역 비중 상한(5건 이상일 때만 본다). */
export const AREA_SKEW_MAX = 0.6
const AREAS = new Set(['1', '2', '3', '4', '5'])

export type Role = 'from' | 'to' | 'alt' | 'compare'
export type Mention = { surface: string; key: string; role: Role; at: number }

// ── ① 추출 ─────────────────────────────────────────────────────────────
/** 구글 플레이 행의 `[SRC: https://…]` 머리글 + 수집기 표식 `[YouTube 댓글 · id]` 를 지운다. */
export const cleanText = (t: unknown) => stripHeader(String(t ?? '').replace(/\[SRC:[^\]\n]*\]/gi, '\n')) as string

/** 이름 자리에 와도 이름이 아닌 말(대명사·관사·일반 명사·수식어). normKey 로 비교. */
const STOP = new Set(
  (
    'this,that,these,those,it,its,them,they,the,a,an,my,your,our,their,another,other,others,one,ones,some,any,all,no,none,something,anything,nothing,everything,' +
    'there,here,what,which,paper,pen,pencil,web,website,browser,desktop,mobile,version,webversion,app,apps,application,tool,tools,software,program,service,platform,' +
    'competitor,competitors,iphone,ipad,android,ios,mac,windows,phone,computer,pc,laptop,free,paid,premium,pro,subscription,manual,spreadsheet,spreadsheets,' +
    '이,이거,이걸,이것,이앱,그거,그걸,저거,앱,어플,어플리케이션,다른,다른앱,다른어플,타사,경쟁사,웹,웹버전,유료,무료,버전,기존,예전,예전에,원래,그냥,계속,전,이전,후,' +
    '폰,아이폰,갤럭시,컴퓨터,노트북,종이,수기,손글씨,업데이트,광고,생각,예상,기대,처음,처음엔,한동안,오래,잘,여기,거기,회사,직장,프로그램,서비스,' +
    // v71am(2026-10-18 표본 30건 실측): 영어 일반어·동명사가 이름으로 잡힌 오탐 23/30 — 일반어 추가
    'just,being,having,using,trying,doing,going,most,more,many,full,both,from,keep,self,solo,when,about,build,cloud,daily,every,https,http,base,actual,current,monthly,regulated,still,also,only,even,much,very,really,then,than,into,over,after,before,while,each,such,same,own,new,old,good,best,better,worse,great,like,make,get,take,use,used,want,need,try,tried,run,work,look,find,know,think,see,come,give,say,show,help,start,stop,move,moved,그대,샴푸'
  ).split(','),
)
/** 일반어와 겹치는 OS 기본 앱 이름(샘플 오탐: Pages·Notes·Calendar). 제품일 수 있어도 자동 경로에서는 기각 + 사유. */
const BUILTIN = new Set(['pages', 'notes', 'calendar', 'reminders', 'mail', 'files', 'photos', 'numbers', 'keynote', 'contacts', 'messages', 'notepad', 'memo', '메모', '캘린더', '달력', '메모장'])
const KO_JOSA = ['을', '를', '은', '는', '도', '만']
/** 이름과 트리거 사이에 끼는 수식어 — 건너뛰고 앞 토큰을 이름으로 본다. 그 밖의 STOP(대명사 등)이면 이름 없음. */
const KO_SKIP = new Set(['유료', '무료', '계속', '그냥', '한동안', '오래', '잘', '원래', '예전에', '처음엔', '오랫동안', '열심히'])

const stripJosa = (t: string) => {
  if (!/[가-힣]$/.test(t)) return t
  for (const j of KO_JOSA) if (t.endsWith(j) && t.length - j.length >= 2) return t.slice(0, -j.length)
  return t
}
const tidy = (s: string) => s.replace(/['’]s$/i, '').replace(/^[\s"“'‘([「『]+|[\s"”'’)\]」』.,!?:;~]+$/g, '')

/** 트리거 뒤 이름(영문 문장). 대문자 단어 최대 3개 묶음 또는 소문자 한 단어("from pages to ginger"). 관사 the 만 건너뛴다. */
function nameAfter(text: string, i: number): { s: string; end: number } | null {
  const m = /^(?:the\s+)?([A-Z][\w.+&'’-]*(?:[ \t]+(?!I\b)[A-Z0-9][\w.+&-]*){0,2}|[a-z][\w.+-]{1,24})/.exec(text.slice(i))
  if (!m) return null
  const s = tidy(m[1])
  return s ? { s, end: i + m[0].length } : null
}

/** 트리거 앞 이름(한국어 문장). 같은 문장 안에서만 본다. 수식어(유료·계속…)는 건너뛴다("트윗버드 유료쓰다가"). */
function nameBefore(text: string, i: number): string | null {
  const head = text.slice(Math.max(0, i - 60), i).split(/[.!?\n]/).pop() ?? ''
  const toks = head.split(/[\s[\](){}「」『』"“”‘’,~:;/|]+/).filter(Boolean)
  let k = toks.length - 1
  while (k >= 0 && KO_SKIP.has(stripJosa(toks[k]))) k--
  if (k < 0 || STOP.has(normKey(stripJosa(toks[k])))) return null
  let name = stripJosa(tidy(toks[k]))
  // 영문 여러 단어 이름("Google Docs 쓰다가")
  for (let j = k - 1; j >= 0 && k - j < 3 && /^[A-Z][\w.+&-]*$/.test(toks[j]) && /^[A-Za-z]/.test(name); j--) name = `${toks[j]} ${name}`
  return name || null
}

const EN_RULES: Array<[RegExp, Role]> = [
  [/\b(?:switch(?:ed|ing)?|mov(?:ed|ing)|migrat(?:ed|ing)|transition(?:ed|ing)?|came|coming|jump(?:ed|ing)?)\s+(?:over\s+)?from\s+/gi, 'from'],
  [/\b(?:switch(?:ed|ing)?|mov(?:ed|ing)|migrat(?:ed|ing)|go(?:ing)?\s+back|went\s+back|jump(?:ed|ing)?\s+ship)\s+(?:over\s+|back\s+)?to\s+/gi, 'to'],
  [/\balternatives?\s+(?:to|for)\s+/gi, 'alt'],
  [/\b(?:instead\s+of|rather\s+than|better\s+than|worse\s+than|compared\s+(?:to|with)|replac(?:ed|ing|es))\s+/gi, 'compare'],
]
const KO_SWITCH = '(?:갈아|넘어|옮겨|옮김|옮겼|바꿨|바꿈|바꿔|바꾸|이사)'
const KO_RULES: Array<[RegExp, Role, ((m: RegExpExecArray, name: string) => boolean)?]> = [
  [new RegExp(`(?:을|를)?\\s*(?:쓰|사용하|이용하)다가(?=[^.!?\\n]{0,30}${KO_SWITCH})`, 'g'), 'from'],
  [new RegExp(`에서\\s*(?=[^.!?\\n]{1,25}?(?:으로|로)\\s*${KO_SWITCH})`, 'g'), 'from'],
  [new RegExp(`(?:으로|로)\\s*${KO_SWITCH}`, 'g'), 'to'],
  // "Evernote 대안" · "에버노트의 대안". 한글 이름은 '의' 가 있을 때만("좋은 대안" 의 형용사를 이름으로 잡지 않게).
  [/(의)?\s*대안/g, 'alt', (m, name) => /^[A-Za-z]/.test(name) || m[1] === '의'],
  // "X 대신" 은 바로 뒤에 쓰다·사용 류가 올 때만("대신 아쉬운 점은" 같은 접속어 오탐 방지).
  [/\s*대신(?:에)?(?=[^.!?\n]{0,20}(?:쓸|써|쓰|사용|이용|설치))/g, 'compare'],
  [/보다\s*(?:훨씬\s*|더\s*|좀\s*)?(?:낫|좋|편|빠르|가볍)/g, 'compare'],
]

/** 글 하나 → 전환·대안 문맥 안의 이름들. 같은 키·같은 역할은 글당 한 번. */
export function extractMentions(raw: unknown): Mention[] {
  const text = cleanText(raw)
  const out = new Map<string, Mention>()
  const push = (surface: string | null, role: Role, at: number) => {
    if (!surface) return
    const key = normKey(surface)
    if (!key || key.length < 2 || /^\d+$/.test(key) || STOP.has(key)) return
    if (!out.has(`${key}|${role}`)) out.set(`${key}|${role}`, { surface, key, role, at })
  }
  for (const [re, role] of EN_RULES) {
    re.lastIndex = 0
    for (let m; (m = re.exec(text)); ) {
      const n = nameAfter(text, m.index + m[0].length)
      if (!n) continue
      push(n.s, role, m.index)
      // "from X to Y" — Y 는 옮겨 간 쪽
      const to = role === 'from' ? /^\s+to\s+/i.exec(text.slice(n.end)) : null
      if (to) push(nameAfter(text, n.end + to[0].length)?.s ?? null, 'to', n.end)
    }
  }
  for (const [re, role, ok] of KO_RULES) {
    re.lastIndex = 0
    for (let m; (m = re.exec(text)); ) {
      const name = nameBefore(text, m.index)
      if (name && (!ok || ok(m, name))) push(name, role, m.index)
    }
  }
  return [...out.values()].sort((a, b) => a.at - b.at)
}

/** 대안 탐색 글(와일드카드 신호): 이름이 없어도 "대안을 찾는 중"인 글. 이름이 같이 나오면 그 후보에 가중. */
const ALT_SEEK = [
  /\b(?:looking\s+for\s+(?:an?\s+)?(?:\w+\s+)?alternatives?|(?:any|good|better)\s+alternatives?|alternatives?\s+(?:to|for)|recommend(?:ed)?\s+(?:an?\s+)?(?:alternative|replacement))\b/i,
  /갈아\s*탈\s*만한|대신\s*쓸\s*만한|대안\s*(?:앱|어플|을|이|찾|추천|없)|대체\s*(?:앱|어플)|다른\s*(?:앱|어플)\s*(?:추천|찾)/,
]
export const isAltSeek = (raw: unknown) => {
  const t = cleanText(raw)
  return ALT_SEEK.some((re) => re.test(t))
}

// ── ② 이름 정리 · ④ 오탐 사유 ─────────────────────────────────────────
export type Exclude = { company_only?: string[]; general_noun?: string[]; acronym?: string[]; hardware?: string[]; person_name?: string[]; tool_not_target?: string[]; metric_term?: string[]; human_rejected_v53?: string[] }

/** 이름 자체로 기각할 사유(없으면 null). cfg = config/product-name-discovery.json 의 exclude. */
export function nameRejectReason(surface: string, key: string, exclude: Exclude = {}): string | null {
  if (STOP.has(key)) return 'stopword'
  if (BUILTIN.has(key)) return 'builtin_generic'
  if (/[가-힣](님|씨)$/.test(surface)) return 'person_name'
  for (const [k, list] of Object.entries(exclude)) if (Array.isArray(list) && list.includes(key)) return k
  if (/^[a-z]+$/.test(surface) && surface.length <= 3) return 'too_short'
  // ponytail: 소문자 단일 영단어는 제품명보다 일반어(reading·default·static)일 때가 압도적 — 표본 30건 실측. 소문자로만 적힌 진짜 제품은 놓친다(대문자 표기 언급이 있으면 그 표기가 이름이 된다)
  if (/^[a-z]+$/.test(surface)) return 'lowercase_word'
  return null
}

// ── ③ 후보 대장 ────────────────────────────────────────────────────────
/** verdict_kind(v71aj 가): approved(사람·자동 승인) · relevant(1차 relevant, 미승인) · alt_seek(판정 무관 대안 탐색 글). 없으면 legacy(옛 읽기 SQL). */
export type Post = { id: string; project_id: string; source_key: string | null; area_code: string | null; raw_text: string; verdict_kind?: string | null }
export type ProjectRow = { id: string; product_elevator_pitch?: string | null; competitor_url?: string | null; area_code?: string | null }
export type TargetRow = { project_id: string; source_key: string; label: string | null; product_ref: string; status?: string | null; total_collected?: number | null; source_enabled?: boolean | null }
export type DiscoveryRow = { name: string; homepage_url?: string | null; verdict: string; verdict_reason?: string | null }

export type Agg = {
  key: string
  name: string
  mentions: number
  posts: string[]
  sources: string[]
  areas: Record<string, number>
  roles: Record<Role, number>
  alt_seek_posts: number
  /** 한글이 든 근거 글 수 — 앱스토어 국가(kr/us) 판정. */
  ko_posts: number
  app_ids: string[]
  /** 근거 글 속 구글 플레이 링크의 패키지명(v71aq). 검증 전 값 — 앱스토어 앵커가 있는 후보의 play_pkg 로만 쓴다. */
  play_pkgs?: string[]
  reject: string | null
  /** (다) 같은 개발사·비슷한 앱 고리에서 이름이 맞은 앱 ref(country:id). 검증 재료(링크 ID 와 같은 자리)일 뿐 등록 근거가 아니다. */
  similar_ref?: string | null
}

/** 근거 글 과반이 한글이면 kr 스토어, 아니면 us. */
export const countryOf = (a: Agg) => (a.ko_posts * 2 > a.posts.length ? 'kr' : 'us')

// 패키지명 = 소문자·숫자·밑줄을 점으로 이은 2단 이상(com.foo.bar)
const PLAY_LINK = /play\.google\.com\/store\/apps\/details\?(?:[^\s"'<>#]*&)?id=([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+)/gi
const APPLE_LINK = /apps\.apple\.com\/(?:[a-z]{2}\/)?app\/(?:[^/\s?#]+\/)?id(\d{5,})/gi

/**
 * 글 → 키별 집계. 자기 이름(그 리뷰가 달린 프로젝트의 이름·라벨·앱 ID)과 이미 등록된 키는 뺀다.
 * 반환 counts: extracted(추출 키) · registered · self · posts_with_mention · alt_seek_posts.
 */
export function aggregate(posts: Post[], ctx: { projects: ProjectRow[]; targets: TargetRow[]; discovery?: DiscoveryRow[]; dictionary?: unknown[]; areaMapSlugs?: string[]; exclude?: Exclude }) {
  const accepted = (ctx.discovery ?? []).filter((d) => d.verdict === 'accepted')
  const registry = buildRegistry({ dictionary: ctx.dictionary ?? [], areaMapSlugs: ctx.areaMapSlugs ?? [], projects: ctx.projects, targets: ctx.targets, discovery: accepted })
  const selfCache = new Map<string, Map<string, string>>()
  const selfOf = (pid: string) => {
    if (!selfCache.has(pid))
      selfCache.set(pid, buildRegistry({ projects: ctx.projects.filter((p) => p.id === pid), targets: ctx.targets.filter((t) => t.project_id === pid) }))
    return selfCache.get(pid)!
  }
  const extracted = new Set<string>()
  const registered = new Set<string>()
  const self = new Set<string>()
  const by = new Map<string, Agg & { _surf: Map<string, number> }>()
  let withMention = 0
  let altSeekPosts = 0
  const kinds: Record<string, { posts: number; with_mention: number }> = {}
  for (const p of posts) {
    const ms = extractMentions(p.raw_text)
    const seek = isAltSeek(p.raw_text)
    if (seek) altSeekPosts++
    if (ms.length) withMention++
    const kk = (kinds[p.verdict_kind ?? 'legacy'] ??= { posts: 0, with_mention: 0 })
    kk.posts++
    if (ms.length) kk.with_mention++
    const ids = [...String(p.raw_text ?? '').matchAll(APPLE_LINK)].map((m) => m[1])
    const pkgs = [...String(p.raw_text ?? '').matchAll(PLAY_LINK)].map((m) => m[1].toLowerCase())
    const seenInPost = new Set<string>()
    for (const m of ms) {
      extracted.add(m.key)
      if (selfOf(p.project_id).has(m.key)) {
        self.add(m.key)
        continue
      }
      if (registry.has(m.key)) {
        registered.add(m.key)
        continue
      }
      const a =
        by.get(m.key) ??
        by.set(m.key, { key: m.key, name: m.surface, mentions: 0, posts: [], sources: [], areas: {}, roles: { from: 0, to: 0, alt: 0, compare: 0 }, alt_seek_posts: 0, ko_posts: 0, app_ids: [], play_pkgs: [], reject: nameRejectReason(m.surface, m.key, ctx.exclude), _surf: new Map() }).get(m.key)!
      a.mentions++
      a.roles[m.role]++
      a._surf.set(m.surface, (a._surf.get(m.surface) ?? 0) + 1)
      if (seenInPost.has(m.key)) continue
      seenInPost.add(m.key)
      a.posts.push(p.id)
      if (p.source_key && !a.sources.includes(p.source_key)) a.sources.push(p.source_key)
      const area = p.area_code ?? 'unmapped'
      a.areas[area] = (a.areas[area] ?? 0) + 1
      if (seek) a.alt_seek_posts++
      if (/[가-힣]/.test(p.raw_text ?? '')) a.ko_posts++
      for (const id of ids) if (!a.app_ids.includes(id)) a.app_ids.push(id)
      for (const k of pkgs) if (!a.play_pkgs!.includes(k)) a.play_pkgs!.push(k)
    }
  }
  const rows: Agg[] = [...by.values()].map(({ _surf, ...a }) => ({ ...a, name: [..._surf.entries()].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0][0], posts: [...a.posts].sort() }))
  return { rows, counts: { posts: posts.length, posts_with_mention: withMention, alt_seek_posts: altSeekPosts, extracted: extracted.size, registered: registered.size, self: self.size, by_kind: kinds } }
}

// ── (가) 입력 풀 ──────────────────────────────────────────────────────
/** approved ⊂ relevant ⊂ wide. legacy(판정 종류 없는 옛 입력)는 어느 풀에서나 남긴다 — 옛 SQL 은 이미 그 풀로 뽑힌 것이다. */
export const POOLS: Readonly<Record<string, readonly string[]>> = {
  approved: ['approved', 'legacy'],
  relevant: ['approved', 'relevant', 'legacy'],
  wide: ['approved', 'relevant', 'alt_seek', 'legacy'],
}
export function filterPool(posts: Post[], pool: string) {
  const keep = POOLS[pool]
  if (!keep) throw new Error(`--pool 은 ${Object.keys(POOLS).join('|')}: ${pool}`)
  return posts.filter((p) => keep.includes(p.verdict_kind ?? 'legacy'))
}

// ── (라) 글 단위 영역 재판정 어댑터 ─────────────────────────────────────
/**
 * HN 재분류 결과(scripts/hn-area-reclass.mjs 출력 jsonl 또는 review_area_verdicts 읽기 결과) → 글 영역 덮어쓰기(메모리 안에서만).
 * 우선순위는 v_input_area_effective 와 한 벌(lib/analysis/area-reclass.ts effectiveArea). 같은 글 여러 판정이면 최신 하나.
 */
export function applyAreaVerdicts(posts: Post[], verdicts: Array<{ input_id: string; area_code: string; fit: number; judged_at: string }>) {
  const latest = latestByInput(verdicts)
  let lifted = 0
  const out = posts.map((p) => {
    const e = effectiveArea(p.area_code, latest.get(p.id) as never)
    if (e.via === 'input') lifted++
    return e.area === p.area_code ? p : { ...p, area_code: e.area }
  })
  return { posts: out, lifted }
}

// ── (다) 비슷한 앱·같은 개발사 고리 ────────────────────────────────────
/** candidate-generator Candidate 라벨 `N:cc|slug` → slug 의 normKey(하이픈 제거). appstore-same-developer.ts 의 slug 와 같은 꼴을 가정한다. */
const similarKey = (c: Candidate) => normKey(String(c.label ?? '').replace(/^[^|]*\|/, '')) as string

/**
 * 같은 개발사 후보 파일(collectSameDeveloper 결과 candidates — 무인 연결 없이 파일로) → 이름이 같은 언급 후보에 앱 ID 를 붙인다.
 * 붙은 ID 는 근거 글 링크 ID 와 같은 자리(app_ids)로 들어가 --lookup·--lookups 검증을 탄다. 검증 없이 anchored 로 올리지 않는다.
 */
export function mergeSimilar(rows: Agg[], similar: Candidate[]) {
  const by = new Map<string, Candidate>()
  for (const c of similar) if (c.source_key === 'appstore' && !by.has(similarKey(c))) by.set(similarKey(c), c)
  let matched = 0
  const out = rows.map((a) => {
    const c = by.get(a.key)
    if (!c) return a
    matched++
    const id = String(c.product_ref).split(':')[1]
    return { ...a, similar_ref: c.product_ref, app_ids: a.app_ids.includes(id) ? a.app_ids : [...a.app_ids, id] }
  })
  return { rows: out, matched }
}

/** 등록 계획(앱스토어 갈래) → 후보 생성기 입력(Candidate[], generator 'mention'). 같은 개발사 후보와 한 파일로 합쳐 candidate-generator.mjs --candidates 로 넘긴다. */
export function toGeneratorCandidates(plan: { register: Array<{ c: Ready; source_key: 'appstore' | 'googleplay' }> }): Candidate[] {
  return plan.register
    .filter((r) => r.source_key === 'appstore')
    .map(({ c }) => ({ generator: 'mention' as const, source_key: 'appstore', product_ref: `${c.country}:${c.verdict.appId}`, label: `${c.area}:${c.country}|${c.key}`, expected_yield: null, evidence: `mention ${c.posts.length}글·${c.sources.length}소스` }))
}

// ── ④ 판정 ─────────────────────────────────────────────────────────────
export type Stage = 'rejected' | 'prior_rejected' | 'hold' | 'candidate' | 'area_fit'
export type Judged = Agg & { stage: Stage; reason: string | null; area: string | null; area_fit: number; score: number }

export function dominantArea(areas: Record<string, number>): { area: string | null; fit: number } {
  const total = Object.values(areas).reduce((s, n) => s + n, 0)
  const top = Object.entries(areas).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]
  return top && total ? { area: top[0], fit: Math.round((top[1] / total) * 1000) / 1000 } : { area: null, fit: 0 }
}

/** 정렬 점수: 글 수 + 소스 다양성 0.5 + 대안 탐색 글 1(와일드카드 신호 — 효과는 altSeekEffect 로 잰다). */
export const scoreOf = (a: Agg, altSeekWeight = 1) => a.posts.length + 0.5 * (a.sources.length - 1) + altSeekWeight * a.alt_seek_posts

/**
 * 단계: rejected(이름 사유) · prior_rejected(지난 대장·발굴 대장에서 기각) · hold(비교만·글 수 미달) · candidate(글 수 통과, 영역 미달) · area_fit(영역 적합 통과).
 * 등록은 area_fit 중 ⑤ 검증(anchored)까지 간 것만.
 */
export function judge(a: Agg, { minPosts = MIN_POSTS_DEFAULT, minSources = 1, areaFitMin = AREA_FIT_MIN, prior = new Map<string, string>() } = {}): Judged {
  const { area, fit } = dominantArea(a.areas)
  const base = { ...a, area, area_fit: fit, score: scoreOf(a) }
  if (prior.has(a.key)) return { ...base, stage: 'prior_rejected', reason: prior.get(a.key)! }
  if (a.reject) return { ...base, stage: 'rejected', reason: a.reject }
  if (a.roles.from + a.roles.to + a.roles.alt === 0) return { ...base, stage: 'hold', reason: 'compare_only' }
  if (a.posts.length < minPosts) return { ...base, stage: 'hold', reason: `below_min_posts(${a.posts.length}/${minPosts})` }
  if (a.sources.length < minSources) return { ...base, stage: 'hold', reason: `below_min_sources(${a.sources.length}/${minSources})` }
  if (!area || !AREAS.has(area) || fit < areaFitMin) return { ...base, stage: 'candidate', reason: `area_fit(${area ?? '-'} ${fit})` }
  return { ...base, stage: 'area_fit', reason: null }
}

/** 기준 조정용 표: 글 수 하한 k 별로 "비교만 아님 ∧ 이름 기각 아님" 후보 수와 그중 검증 상태. 검증 결과 없으면 unverified 로 센다. */
export function thresholdTable(rows: Agg[], verdicts: Map<string, AnchorVerdict['state']> = new Map(), ks = [1, 2, 3, 4, 5]) {
  const live = rows.filter((a) => !a.reject && a.roles.from + a.roles.to + a.roles.alt > 0)
  return ks.map((k) => {
    const pass = live.filter((a) => a.posts.length >= k)
    const st = (s: string) => pass.filter((a) => (verdicts.get(a.key) ?? 'unverified') === s).length
    const checked = pass.length - st('unverified') - st('lookup_failed')
    return { k, candidates: pass.length, anchored: st('anchored'), no_match: st('no_match'), ambiguous: st('ambiguous'), unverified: st('unverified') + st('lookup_failed'), precision: checked ? Math.round((st('anchored') / checked) * 100) / 100 : null }
  })
}

// ── (나) 통과 기준 변형 · 오탐률 표본 ──────────────────────────────────
export type Criterion = { id: string; minPosts: number; minSources: number }
/** "3" → 3글 · "2+2" → 2글 ∧ 서로 다른 소스 2곳 이상. */
export function parseCriterion(s: string): Criterion {
  const m = /^(\d+)(?:\+(\d+))?$/.exec(String(s).trim())
  if (!m || Number(m[1]) < 1) throw new Error(`기준 형식은 N 또는 N+S (예: 3, 2+2): ${s}`)
  const minPosts = Number(m[1])
  const minSources = Number(m[2] ?? 1)
  return { id: m[2] ? `${minPosts}글+${minSources}소스` : `${minPosts}글`, minPosts, minSources }
}
/** 등록(마이그 초안·대장 accepted)에 쓸 수 있는 글 수 하한 — #561 CHECK·toApproved 와 같은 값. 시험 기준은 이보다 낮아도 보고만 한다. */
export const REGISTER_MIN_POSTS = 3

/** 기준별 후보 수 비교. 후보 = candidate ∪ area_fit. labels(key → ok) 가 있으면 그 기준 표본(sampled_for)으로 오탐률을 잰다. */
export function compareCriteria(rows: Agg[], criteria: Criterion[], { prior = new Map<string, string>(), labels = new Map<string, { ok: boolean; sampled_for: string[] }>() } = {}) {
  return criteria.map((c) => {
    const js = rows.map((a) => judge(a, { minPosts: c.minPosts, minSources: c.minSources, prior }))
    const live = js.filter((j) => j.stage === 'candidate' || j.stage === 'area_fit')
    const lab = [...labels.entries()].filter(([k, v]) => v.sampled_for.includes(c.id) && live.some((j) => j.key === k))
    const fp = lab.filter(([, v]) => !v.ok).length
    return { criterion: c.id, candidates: live.length, area_fit: live.filter((j) => j.stage === 'area_fit').length, keys: live.map((j) => j.key), labeled: lab.length, false_pos: fp, fp_rate: lab.length ? Math.round((fp / lab.length) * 1000) / 1000 : null }
  })
}

/** 결정적 표본(키 해시 순) — 같은 입력이면 같은 표본. 무작위 대신 해시라 재현된다. */
const hash = (s: string) => [...s].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 7)
export function pickSample<T extends { key: string }>(rows: T[], n: number) {
  return [...rows].sort((a, b) => hash(a.key) - hash(b.key) || (a.key < b.key ? -1 : 1)).slice(0, n)
}

/** 언급 주변 문맥(±80자). 원문 조각이 들어간다 — 표본 파일은 리포에 커밋하지 않는다. */
export function snippet(raw: string, name: string) {
  const t = cleanText(raw).replace(/\s+/g, ' ')
  const i = t.toLowerCase().indexOf(name.toLowerCase())
  return i < 0 ? t.slice(0, 160) : t.slice(Math.max(0, i - 80), i + name.length + 80)
}

/** 사람 판정 CSV(key,human_ok,sampled_for,…) → Map. human_ok 는 Y/N(빈칸 = 미채점). */
export function parseSampleLabels(csv: string) {
  const m = new Map<string, { ok: boolean; sampled_for: string[] }>()
  for (const line of String(csv).split(/\r?\n/).slice(1)) {
    const [key, ok, sf] = line.split(',').map((s) => s.trim().replace(/^"|"$/g, ''))
    if (!key || !ok) continue
    if (!/^[YN]$/i.test(ok)) throw new Error(`human_ok 는 Y/N: ${key} ${ok}`)
    m.set(key, { ok: /^y$/i.test(ok), sampled_for: (sf ?? '').split('|').filter(Boolean) })
  }
  return m
}

/**
 * (마) 등록 모드 문턱: CEO-staff 가 dry-run 후보 표본을 직접 읽은 결과. 채점 ≥ minN ∧ 적합 비율 ≥ minOk 일 때만 pass.
 * 채점이 모자라면 unverified(통과 아님, §7.1).
 */
export function reviewGate(labels: Map<string, { ok: boolean }>, { minN = 30, minOk = 0.9 } = {}) {
  const n = labels.size
  const ok = [...labels.values()].filter((v) => v.ok).length
  const rate = n ? Math.round((ok / n) * 1000) / 1000 : null
  const decision = n < minN ? 'unverified' : (rate as number) < minOk ? 'stop' : 'pass'
  return { n, ok, rate, decision, rejected_keys: [...labels.entries()].filter(([, v]) => !v.ok).map(([k]) => k) }
}

// ── ⑤ 검증 ─────────────────────────────────────────────────────────────
/**
 * 후보 하나의 검증. lookups = 앱 ID → iTunes lookup results(근거 글 속 링크 ID), searched = 이름 → search results(사람 판단 뒤에만 채워진다).
 * 링크 ID 중 이름이 맞는 앱이 있으면 그것, 아니면 검색 결과. 둘 다 없으면 lookup_failed(= 확인 불가, 등록 안 함).
 */
export function verifyCandidate(a: Agg, { lookups = new Map<string, unknown>(), searched = new Map<string, unknown>() } = {}): AnchorVerdict {
  const fromLinks = a.app_ids.filter((id) => lookups.has(id)).flatMap((id) => (lookups.get(id) as unknown[]) ?? [])
  if (fromLinks.length) {
    const v = verifyAnchor(a.name, fromLinks)
    if (v.state === 'anchored') return v
  }
  if (searched.has(a.key)) return verifyAnchor(a.name, searched.get(a.key))
  // 링크 앱 이름이 안 맞아도 no_match 로 접지 않는다 — 글 속 링크는 리뷰 대상 앱 자신일 수 있다.
  const why = fromLinks.length ? '링크 앱 이름 불일치' : a.app_ids.length ? '링크 앱 ID 조회 결과 없음' : '앱 ID 없음'
  return { state: 'lookup_failed', reason: `${why} — 이름 검색(itunes /search)은 robots 금지 경로라 사람 판단 대기` }
}

// ── 이름 → 앱 ID: anchor-verify.mjs(정책 A /search, 하루 100) 와 파일로 잇기 ───────────
/** 확인 불가 후보(area_fit 먼저, 점수 순) → anchor-verify.mjs --input 꼴. 하루 상한을 넘겨 넣지 않는다. */
export function anchorVerifyInput(judged: Judged[], verdicts: Map<string, AnchorVerdict>, cap = 100) {
  const rank = (j: Judged) => (j.stage === 'area_fit' ? 0 : 1)
  return judged
    .filter((j) => (j.stage === 'area_fit' || j.stage === 'candidate') && verdicts.get(j.key)?.state === 'lookup_failed')
    .sort((a, b) => rank(a) - rank(b) || b.score - a.score || (a.key < b.key ? -1 : 1))
    .slice(0, cap)
    .map((j) => ({ slug: j.key, name: j.name, expected_domain: null, country: countryOf(j) }))
}
/** anchor-verify.mjs --out 결과 → key → {verdict, country}. 그 판정은 이미 verifyAnchor 를 거친 것이다. */
export function anchorVerdictMap(rows: Array<{ slug?: string; name?: string; country?: string; verdict?: AnchorVerdict }>) {
  const m = new Map<string, { verdict: AnchorVerdict; country: string | null }>()
  for (const r of rows) if (r?.verdict?.state) m.set(String(r.slug ?? normKey(r.name)), { verdict: r.verdict, country: r.country ?? null })
  return m
}

// ── ⑦ 30% 게이트 ───────────────────────────────────────────────────────
export function gateState(targets: TargetRow[]) {
  const act = targets.filter((t) => t.status === 'active' && t.source_enabled !== false)
  const n = (k: string) => act.filter((t) => t.source_key === k).length
  return { total_active: act.length, appstore_active: n('appstore'), googleplay_active: n('googleplay') }
}

export type Ready = Judged & { verdict: Extract<AnchorVerdict, { state: 'anchored' }>; play_pkg?: string | null; country: string }
/**
 * 등록 계획. 앱스토어 30% 게이트 안에서 점수 순으로, 넘치는 것은 구글 플레이 패키지를 알 때만 구글 플레이(활성 80 동결 안)로,
 * 둘 다 안 되면 차단 + 사유(매일 지표에 센다). 게이트 남은 자리는 한 번만 계산한다(보수 쪽 — target-supply shareHeadroom 과 같은 가정).
 */
export function planGate(ready: Ready[], state: ReturnType<typeof gateState>) {
  let as = gateHeadroom('appstore', state.appstore_active, state.total_active)
  let gp = gateHeadroom('googleplay', state.googleplay_active, state.total_active)
  const register: Array<{ c: Ready; source_key: 'appstore' | 'googleplay' }> = []
  const blocked: Array<{ c: Ready; reason: string }> = []
  // v71aj D-48(E): ready = 영역 적합(≥0.9)·anchored 통과분. 그 안에서 앱 평가 수(iTunes userRatingCount, 리뷰 수 대리값) 많은 순 → 점수 → 키.
  // 게이트(앱스토어 30%·구글 플레이 80)는 그대로 — 자리가 모자랄 때 큰 앱이 먼저 들어가게 순서만 바꾼다.
  for (const c of [...ready].sort((x, y) => (y.verdict.ratingCount ?? 0) - (x.verdict.ratingCount ?? 0) || y.score - x.score || (x.key < y.key ? -1 : 1))) {
    if (as > 0) {
      as--
      register.push({ c, source_key: 'appstore' })
    } else if (c.play_pkg && gp > 0) {
      gp--
      register.push({ c, source_key: 'googleplay' })
    } else blocked.push({ c, reason: c.play_pkg ? 'appstore_30pct+googleplay_80' : 'appstore_30pct(구글 플레이 패키지 모름)' })
  }
  return { register, blocked, headroom_after: { appstore: as, googleplay: gp } }
}

/** candidate-register-draft.mjs --approved 입력 꼴(마이그 초안 경로 재사용). 근거 글 id 는 최소 3개를 요구한다. */
export function toApproved(plan: ReturnType<typeof planGate>) {
  return plan.register.map(({ c, source_key }) => {
    if (c.posts.length < 3) throw new Error(`근거 글 3개 미만은 등록 초안에 못 올린다: ${c.key}`)
    return {
      name: c.verdict.trackName.split(/\s[-–—|:]\s|:\s/)[0] || c.name,
      norm_key: c.key,
      area: c.area,
      anchors: source_key === 'appstore' ? { appstore_id: String(c.verdict.appId), appstore_country: c.country, play_pkg: null, domain: c.verdict.domain } : { appstore_id: null, play_pkg: c.play_pkg, domain: c.verdict.domain },
      evidence_input_ids: c.posts.slice(0, 10),
      origin: 'mention_loop',
    }
  })
}

// ── ⑨ 지표 · ⑩ 안전 ────────────────────────────────────────────────────
/** 등록 앱당 평균 수확: 이 루프가 등록한 (source_key, product_ref) 의 total_collected 평균. 없으면 null(0 으로 접지 않는다). */
export function harvestPerApp(targets: TargetRow[], registeredRefs: string[]) {
  const set = new Set(registeredRefs)
  const hit = targets.filter((t) => set.has(`${t.source_key}|${t.product_ref}`))
  return hit.length ? { avg: Math.round((hit.reduce((s, t) => s + (t.total_collected ?? 0), 0) / hit.length) * 10) / 10, n: hit.length } : { avg: null, n: 0 }
}

/** 와일드카드 효과 측정: 대안 탐색 글이 붙은 후보 vs 아닌 후보의 검증 통과율. 수확은 등록 뒤 harvestPerApp 을 같은 두 묶음으로 나눠 본다. */
export function altSeekEffect(judged: Judged[], verdicts: Map<string, AnchorVerdict['state']>) {
  const g = (rows: Judged[]) => {
    const checked = rows.filter((r) => ['anchored', 'no_match', 'ambiguous'].includes(verdicts.get(r.key) ?? ''))
    return { n: rows.length, checked: checked.length, anchored: checked.filter((r) => verdicts.get(r.key) === 'anchored').length }
  }
  const live = judged.filter((r) => r.stage === 'area_fit' || r.stage === 'candidate')
  return { with_alt_seek: g(live.filter((r) => r.alt_seek_posts > 0)), without: g(live.filter((r) => r.alt_seek_posts === 0)) }
}

export type Metrics = {
  date: string
  extracted: number
  new_names: number
  candidates: number
  area_fit: number
  registered: number
  harvest_avg: number | null
  harvest_n: number
  by_area: Record<string, number>
  gate_blocked: number
  alt_seek_posts: number
  lookups: number
  lookup_blocked: boolean
}

export function metricsLine(m: Metrics) {
  const area = ['1', '2', '3', '4', '5'].map((a) => `${'①②③④⑤'[Number(a) - 1]}${m.by_area[a] ?? 0}`).join(' ')
  return (
    `[언급 루프 ${m.date}] 추출 이름 ${m.extracted} · 새 이름 ${m.new_names} · 후보 ${m.candidates} · 영역 적합 통과 ${m.area_fit} · 등록 ${m.registered} · ` +
    `등록 앱당 평균 수확 ${m.harvest_avg ?? '확인 불가'}(${m.harvest_n}개) · 영역 ${area} · 30% 게이트 차단 ${m.gate_blocked} · 대안 탐색 글 ${m.alt_seek_posts}`
  )
}

/** 경보: 조회 차단(그 경로만 그날 중단) · 조회 수 상한 · 영역 쏠림. 모델 호출은 이 루프에 없다(추가하면 여기 비용 상한을 더한다). */
export function safetyAlerts(m: Metrics, ready: Judged[], { maxLookups = 30 } = {}) {
  const out: string[] = []
  if (m.lookup_blocked) out.push('앱 조회 차단 신호(403/429/빈 응답) — 오늘 검증 경로 중단, 등록 0')
  if (m.lookups > maxLookups) out.push(`앱 조회 ${m.lookups}회 > 상한 ${maxLookups}`)
  if (ready.length >= 5) {
    const { area, fit } = dominantArea(Object.fromEntries(['1', '2', '3', '4', '5'].map((a) => [a, ready.filter((r) => r.area === a).length])))
    if (fit > AREA_SKEW_MAX) out.push(`영역 쏠림: 영역 ${area} 가 등록 가능 후보의 ${Math.round(fit * 100)}%`)
  }
  return out
}

/**
 * 대장 ON CONFLICT 갱신 조건. HN 발굴(origin NULL)·채택(accepted)·새 출시 입력 행은 덮지 않는다.
 * v71ba: 새 출시 입력이 CHECK(origin IN ('mention')) 때문에 origin='mention' 으로 들어간 행(verdict_reason '새 출시 입력…')이 있다 — 언급 집계로 덮으면 두 갈래가 섞인다.
 */
export const LEDGER_UPDATE_GUARD = "public.discovery_candidates.origin = 'mention' AND public.discovery_candidates.verdict <> 'accepted' AND coalesce(public.discovery_candidates.verdict_reason, '') NOT LIKE '새 출시 입력%'"

/** 대장(discovery_candidates, 마이그 20261017000021 적용 뒤) INSERT 문. */
export function renderLedgerSql(judged: Judged[], verdicts: Map<string, AnchorVerdict>, blocked: Set<string>, date: string) {
  const q = (s: unknown) => (s == null ? 'NULL' : `'${String(s).replace(/'/g, "''")}'`)
  const rows = judged
    .filter((j) => j.stage !== 'prior_rejected')
    .map((j) => {
      const v = verdicts.get(j.key)
      const anchored = v?.state === 'anchored' && j.stage === 'area_fit' && !blocked.has(j.key)
      const verdict = anchored ? 'accepted' : j.stage === 'rejected' || v?.state === 'no_match' || v?.state === 'ambiguous' ? 'rejected' : 'unverified'
      const reason = j.reason ?? (v ? `${v.state}: ${v.reason}` : '검증 안 함') + (blocked.has(j.key) ? ' · 30% 게이트 차단' : '')
      const probe = v?.state === 'anchored' ? [q('appstore'), q(`${countryOf(j)}:${v.appId}`), String(v.ratingCount)] : ['NULL', 'NULL', 'NULL']
      return `  ('saas', ${q(j.name)}, ${q(`리뷰 속 언급 ${j.posts.length}글·${j.sources.length}소스(역할 from ${j.roles.from}/to ${j.roles.to}/alt ${j.roles.alt}/compare ${j.roles.compare})`)}, ${probe.join(', ')}, ${q(verdict)}, ${q(reason)}, 'mention', ${j.mentions}, ${j.posts.length}, ${j.sources.length}, ${j.alt_seek_posts}, ARRAY[${j.posts.slice(0, 10).map(q).join(', ')}]::uuid[], ${q(j.area)}, ${j.area_fit}, ${q(blocked.has(j.key) ? 'appstore_30pct' : null)}, ${q(`${date}T00:00:00+09:00`)})`
    })
  if (!rows.length) return '-- 대장 행 없음\n'
  return (
    `-- 언급 루프 대장 ${date} — discovery_candidates(origin='mention'). 사람·역할 세션이 적용. HN 발굴 행(origin NULL)은 ON CONFLICT 에서 건드리지 않는다.\n` +
    `INSERT INTO public.discovery_candidates (kind, name, why, probe_source_key, probe_ref, probe_hits, verdict, verdict_reason, origin, mention_count, post_count, source_count, alt_seek_posts, evidence_input_ids, area_code, area_fit, gate_blocked, last_seen_at)\nVALUES\n` +
    rows.join(',\n') +
    `\nON CONFLICT (kind, lower(name)) DO UPDATE SET mention_count = EXCLUDED.mention_count, post_count = EXCLUDED.post_count, source_count = EXCLUDED.source_count, alt_seek_posts = EXCLUDED.alt_seek_posts, evidence_input_ids = EXCLUDED.evidence_input_ids, area_code = EXCLUDED.area_code, area_fit = EXCLUDED.area_fit, gate_blocked = EXCLUDED.gate_blocked, last_seen_at = EXCLUDED.last_seen_at\n  WHERE ${LEDGER_UPDATE_GUARD};\n`
  )
}
