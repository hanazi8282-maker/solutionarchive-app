// /relevance/grade 카드의 번역·제품 배경·스레드 제목 — 순수 모듈(DB·시계·네트워크 없음).
// 배치 생성: scripts/relevance-translate.mjs · 셀프테스트: scripts/relevance-translate-selftest.mjs · 저장: 마이그 20260930000035.
//
// ⛔ 채점 독립성(남헌 2026-09-29). 이 화면은 사람 채점이 모델 판정에 끌리지 않게 판정을 숨긴다. 그래서 여기서 만드는
//    글은 전부 **순수 사실**이어야 한다 — 번역은 충실한 옮김만, 배경은 "이 제품이 무엇이고 무엇을 하는가"만.
//    "관련 있어 보인다"·"정보가 풍부하다"·요약·감정 라벨·강조·어떤 판단도 금지. 세 겹으로 지킨다:
//      1. 프롬프트가 그 제한을 명시한다(PROMPT_RESTRICTIONS 를 셀프테스트가 대조).
//      2. 출력 사후검사(checkTranslation·checkBackground)가 평가 표지를 잡으면 failed 로 저장 → 화면은 "번역 실패".
//      3. 이 모듈·프롬프트는 판정 필드를 받지 않는다(TranslateItem 에 verdict 계열 없음 — 셀프테스트가 정적 검사).
//
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다. `@/` 별칭·enum 을 쓰지 않는다.

/** 프롬프트·검사 규칙을 바꾸면 올린다. 캐시 행의 prompt_version 이 다르면 다시 만든다. */
export const TRANSLATE_PROMPT_VERSION = 'tr-v1-2026-09-29'
export const TRANSLATIONS_MIGRATION = '20260930000035_relevance_translations.sql'

export type CacheStatus = 'ok' | 'failed' | 'skipped'

/** 번역 입력. **판정 필드가 없다** — 이 타입에 verdict 계열을 더하지 않는다. */
export interface TranslateItem {
  input_id: string
  project_id: string | null
  source_key: string | null
  raw_text: string
}

export interface TranslationRow {
  input_id: string
  source_key: string | null
  thread_key: string | null
  thread_title: string | null
  thread_title_ko: string | null
  text_ko: string | null
  status: CacheStatus
  fail_reason: string | null
  model: string | null
  prompt_version: string
}

export interface BackgroundRow {
  project_id: string
  background: string | null
  status: CacheStatus
  fail_reason: string | null
  model: string | null
  prompt_version: string
}

// ── 프롬프트 ──────────────────────────────────────────────────────────────
// 세 프롬프트 모두 "사실만·판단 없음"을 명시한다. 아래 PROMPT_RESTRICTIONS 의 문구가 전부 들어 있어야 셀프테스트가 통과한다.

export const TRANSLATION_SYSTEM = [
  '너는 번역기다. 아래 원문을 한국어로 충실하게 번역만 한다.',
  '지켜야 할 것:',
  '- 요약하지 않는다. 생략하지 않는다. 문장 순서와 내용을 그대로 옮긴다.',
  '- 해설·평가·의견·감정 라벨·강조·머리말·꼬리말을 붙이지 않는다. 원문에 없는 내용을 더하지 않는다.',
  '- 이 글이 어떤 제품과 관련 있는지, 유용한지, 정보가 있는지에 대해 어떤 판단도 적지 않는다.',
  '- 제품명·서비스명·URL·고유명사는 원문 표기를 그대로 둔다. 욕설·비꼼도 순화하지 않고 그대로 옮긴다.',
  '- 마크다운·따옴표·코드블록 없이 번역문 본문만 출력한다.',
].join('\n')

export const TITLE_SYSTEM = [
  '너는 번역기다. 아래는 게시글(스레드)의 제목이다. 한국어로 충실하게 번역만 한다.',
  '- 요약하지 않는다. 해설·평가·의견을 붙이지 않는다. 원문에 없는 내용을 더하지 않는다.',
  '- 제품명·고유명사는 원문 표기를 그대로 둔다.',
  '- 번역한 제목 한 줄만 출력한다.',
].join('\n')

export const BACKGROUND_SYSTEM = [
  '아래 제품 소개를 근거로, 이 제품이 무엇이고 무엇을 하는지만 한국어 1~2문장으로 적는다.',
  '지켜야 할 것:',
  '- 사실만 적는다. 평가·추천·장단점·시장 위치·인기·경쟁력 같은 판단을 적지 않는다.',
  '- 형용사로 꾸미지 않는다("훌륭한", "강력한", "편리한", "유명한" 금지). 감탄·강조 금지.',
  '- 이 제품에 대한 리뷰가 관련 있는지, 유용한지, 정보가 있는지에 대해 어떤 판단도 적지 않는다.',
  '- 소개에 없는 사실을 지어내지 않는다. 소개가 부족하면 아는 범위의 사실(제품 종류·하는 일)만 적는다.',
  '- 형식: "<제품명>: <종류>. <하는 일>." 마크다운·따옴표 없이 본문만 출력한다.',
  '  예: "Lemon Squeezy: SaaS·디지털 상품 판매자용 결제 대행 서비스. 세금·사기방지·환불을 대신 처리하고 수수료를 뗀다."',
].join('\n')

/** 각 프롬프트에 반드시 들어 있어야 하는 제한 문구. 하나라도 빠지면 셀프테스트가 실패한다. */
export const PROMPT_RESTRICTIONS: Readonly<Record<'translation' | 'title' | 'background', readonly string[]>> = {
  translation: ['요약하지 않는다', '생략하지 않는다', '평가', '원문에 없는 내용을 더하지 않는다', '어떤 판단도 적지 않는다', '번역문 본문만'],
  title: ['요약하지 않는다', '평가', '원문에 없는 내용을 더하지 않는다', '한 줄만'],
  background: ['사실만', '평가·추천·장단점', '형용사로 꾸미지 않는다', '어떤 판단도 적지 않는다', '지어내지 않는다'],
}

export function buildTranslationPrompt(body: string): string {
  return `## 원문\n${body}`
}
export function buildTitlePrompt(title: string): string {
  return `## 제목\n${title}`
}
export function buildBackgroundPrompt(p: { pitch: string; competitorUrl?: string | null }): string {
  return [`## 제품 소개`, p.pitch, ...(p.competitorUrl ? [`## 제품 URL`, p.competitorUrl] : [])].join('\n')
}

// ── 원문 헤더 → 스레드 맥락 ─────────────────────────────────────────────────
// 어댑터가 본문 앞에 붙이는 머리표에서 "어느 스레드에 달린 댓글인가"를 읽는다. 저장된 것만 읽는다 — 없는 제목을 지어내지 않는다.
//   hackernews : `[HN: <스토리 제목> · https://news.ycombinator.com/item?id=<id>] 본문`  → 제목 있음
//   producthunt: `[Product Hunt 댓글 · <post 슬러그>] 본문`                              → 슬러그만(어댑터 GraphQL 이 post.name 을 안 가져온다)
//   youtube    : `[YouTube 댓글 · <videoId>] 본문`                                        → videoId 만(commentThreads API 에 영상 제목이 없다)
//   그 밖(다나와·앱스토어·커뮤니티 글 등): 머리표 없음 → 스레드 개념 없음(null)

export interface SourceContext {
  /** 같은 스레드의 댓글이 공유하는 키(제목 번역 1회 재사용의 단위). */
  threadKey: string | null
  /** 저장돼 있는 원제. PH·YouTube 는 null — 제목이 저장돼 있지 않다. */
  threadTitle: string | null
  /** 스레드 식별용 표시(슬러그·videoId·URL). 제목이 없을 때 화면이 이걸 그대로 보여 준다. */
  threadRef: string | null
  /** 머리표를 뗀 본문(번역 대상). */
  body: string
}

const HN_HEAD = /^\[HN:\s*([\s\S]*?)(?:\s*·\s*(https?:\/\/\S+?))?\]\s*/
const PH_HEAD = /^\[Product Hunt 댓글 · ([a-z0-9-]+)\]\s*/
const YT_HEAD = /^\[YouTube 댓글 · ([A-Za-z0-9_-]+)\]\s*/

export function parseSourceContext(sourceKey: string | null | undefined, rawText: string): SourceContext {
  const text = rawText ?? ''
  const none: SourceContext = { threadKey: null, threadTitle: null, threadRef: null, body: text.trim() }
  if (sourceKey === 'hackernews') {
    const m = HN_HEAD.exec(text)
    if (!m) return none
    const title = m[1].trim() || null
    const url = m[2] ?? null
    const id = url ? /id=(\d+)/.exec(url)?.[1] ?? null : null
    // 스레드 id 가 없으면(옛 형식) 제목 자체를 키로 쓴다 — 같은 제목의 댓글끼리는 어차피 같은 번역이다.
    return { threadKey: id ?? title, threadTitle: title, threadRef: url ?? title, body: text.slice(m[0].length).trim() }
  }
  if (sourceKey === 'producthunt') {
    const m = PH_HEAD.exec(text)
    return m ? { threadKey: m[1], threadTitle: null, threadRef: `producthunt.com/posts/${m[1]}`, body: text.slice(m[0].length).trim() } : none
  }
  if (sourceKey === 'youtube') {
    const m = YT_HEAD.exec(text)
    return m ? { threadKey: m[1], threadTitle: null, threadRef: `youtube.com/watch?v=${m[1]}`, body: text.slice(m[0].length).trim() } : none
  }
  return none
}

// ── 번역 필요 여부 ────────────────────────────────────────────────────────────
const HANGUL = /[가-힣]/g
const LATIN = /[A-Za-z]/g
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length

/** 한글이 로마자보다 많으면 이미 한국어 글이다 — 번역하지 않는다(skipped). 둘 다 없으면(숫자·기호뿐) 역시 skipped. */
export function needsTranslation(body: string): boolean {
  const h = count(body, HANGUL)
  const l = count(body, LATIN)
  if (h + l === 0) return false
  return l > h
}

// ── 출력 사후검사 ─────────────────────────────────────────────────────────────
// 통과하지 못한 출력은 저장하지 않는다(failed). 화면은 원문만 보여 주고 "번역 실패"를 단다 — 오염된 글을 보여 주느니 안 보여 준다.

export type Check = { ok: true } | { ok: false; reason: string }

/** 번역문에 붙으면 안 되는 것 — 해설·머리말·역주·요약 표지. (원문에 있는 "추천한다" 같은 말은 번역이므로 막지 않는다.) */
const TRANSLATION_TAINT: readonly [RegExp, string][] = [
  [/^\s*(번역|역문|해석|요약|번역문|Translation)\s*[:：]/im, '머리말(번역:/요약:)'],
  [/[\(\[（【]\s*(역주|옮긴이|번역자|역자)\s*[:：]?/, '역주'],
  [/(^|\n)\s*(요약하면|요약:|정리하면|참고로|참고:|주:|※)/, '해설·요약 표지'],
  [/(^|\n)\s*이 (리뷰|글|댓글|게시물|원문)(은|는|이|가)\s/, '리뷰에 대한 해설'],
  [/(관련(성이|이) (있|없)어 보|정보가 (풍부|부족)|유용해 보|도움이 될 것 같)/, '평가 문구'],
  [/^\s*(Sure|Here is|I cannot|I can't|죄송)/i, '모델 응답문'],
  [/```/, '코드블록'],
]

/** 배경문에 들어가면 안 되는 평가 표지. 하나라도 있으면 failed. */
export const BACKGROUND_TAINT_WORDS: readonly string[] = [
  '관련', '유용', '정보가', '추천', '보인다', '보임', '것 같', '듯하',
  '훌륭', '뛰어난', '최고', '인기', '선도', '혁신', '강력', '편리', '간편', '유명', '대표적', '널리', '신뢰',
  '장점', '단점', '경쟁력', '우수', '최적', '필수', '효율적', '저렴', '합리적', '가성비', '만족',
  '리뷰', '댓글', '이 글', '사용자들이', '많은 사람',
]

export const BACKGROUND_MAX = 240

export function checkTranslation(source: string, out: string): Check {
  const text = out.trim()
  if (!text) return { ok: false, reason: '빈 출력' }
  if (count(text, HANGUL) === 0) return { ok: false, reason: '한국어가 아니다' }
  for (const [re, why] of TRANSLATION_TAINT) if (re.test(text)) return { ok: false, reason: why }
  // 길이 비율 — 한국어는 영어보다 글자 수가 적다(대략 0.4~0.8배). 너무 짧으면 요약, 너무 길면 덧붙임이다.
  const ratio = text.length / Math.max(source.trim().length, 1)
  if (ratio < 0.2) return { ok: false, reason: `너무 짧다(원문 대비 ${ratio.toFixed(2)}배) — 요약·생략 의심` }
  if (ratio > 2.5) return { ok: false, reason: `너무 길다(원문 대비 ${ratio.toFixed(2)}배) — 덧붙임 의심` }
  return { ok: true }
}

export function checkTitle(source: string, out: string): Check {
  const text = out.trim()
  if (!text) return { ok: false, reason: '빈 출력' }
  if (/\n/.test(text)) return { ok: false, reason: '한 줄이 아니다' }
  if (count(text, HANGUL) === 0) return { ok: false, reason: '한국어가 아니다' }
  for (const [re, why] of TRANSLATION_TAINT) if (re.test(text)) return { ok: false, reason: why }
  if (text.length > Math.max(source.length * 3, 60)) return { ok: false, reason: '제목이 원제보다 지나치게 길다' }
  return { ok: true }
}

export function checkBackground(out: string): Check {
  const text = out.trim()
  if (!text) return { ok: false, reason: '빈 출력' }
  if (count(text, HANGUL) === 0) return { ok: false, reason: '한국어가 아니다' }
  if (text.length > BACKGROUND_MAX) return { ok: false, reason: `${BACKGROUND_MAX}자 초과(${text.length}자)` }
  if (/[!！]/.test(text)) return { ok: false, reason: '감탄 부호' }
  if (/```|\*\*/.test(text)) return { ok: false, reason: '마크다운' }
  for (const w of BACKGROUND_TAINT_WORDS) if (text.includes(w)) return { ok: false, reason: `평가 표지 "${w}"` }
  return { ok: true }
}

/** 모델 출력의 겉치레(코드펜스·감싼 따옴표) 제거. 내용은 건드리지 않는다. */
export function stripOutput(raw: string): string {
  let s = (raw ?? '').trim()
  s = s.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/, '').trim()
  if (s.length >= 2 && ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith('“') && s.endsWith('”')))) s = s.slice(1, -1).trim()
  return s
}

// ── 캐시 판단 ─────────────────────────────────────────────────────────────────
// 한 번 만든 것은 다시 부르지 않는다. 다시 만드는 경우는 둘뿐: prompt_version 이 다르다 · --retry-failed 로 failed 를 다시 시도.

export function needsWork(row: { status: CacheStatus; prompt_version: string } | null | undefined, opts: { version?: string; retryFailed?: boolean } = {}): boolean {
  const version = opts.version ?? TRANSLATE_PROMPT_VERSION
  if (!row) return true
  if (row.prompt_version !== version) return true
  return row.status === 'failed' && opts.retryFailed === true
}

/** 같은 스레드의 제목 번역이 이미 있으면(같은 버전·ok) 재사용한다. 없으면 null. */
export function reuseThreadTitle(
  rows: readonly Pick<TranslationRow, 'source_key' | 'thread_key' | 'thread_title' | 'thread_title_ko' | 'status' | 'prompt_version'>[],
  sourceKey: string | null,
  threadKey: string | null,
  version = TRANSLATE_PROMPT_VERSION,
): string | null {
  if (!sourceKey || !threadKey) return null
  const hit = rows.find((r) => r.source_key === sourceKey && r.thread_key === threadKey && r.thread_title_ko && r.status === 'ok' && r.prompt_version === version)
  return hit?.thread_title_ko ?? null
}

// ── 생성 ──────────────────────────────────────────────────────────────────────

export type LlmCall = (system: string, user: string, label: string) => Promise<{ text: string; model: string }>

/**
 * 리뷰 1건 번역 + (있으면) 스레드 제목 번역. 호출은 주입(call) — 배치 스크립트는 claude-cli, 셀프테스트는 가짜.
 * 제목 번역이 실패해도 본문 번역은 저장한다(제목은 null). 본문이 실패하면 행 전체가 failed 다.
 * 한국어 글은 부르지 않고 skipped 로 저장한다(다음 실행이 다시 고르지 않게).
 */
export async function generateTranslation(
  call: LlmCall,
  item: TranslateItem,
  opts: { threadTitleKo?: string | null; version?: string } = {},
): Promise<TranslationRow> {
  const version = opts.version ?? TRANSLATE_PROMPT_VERSION
  const ctx = parseSourceContext(item.source_key, item.raw_text)
  const base = { input_id: item.input_id, source_key: item.source_key, thread_key: ctx.threadKey, thread_title: ctx.threadTitle, prompt_version: version }

  if (!needsTranslation(ctx.body)) {
    return { ...base, thread_title_ko: null, text_ko: null, status: 'skipped', fail_reason: '한국어 원문', model: null }
  }

  let threadTitleKo: string | null = opts.threadTitleKo ?? null
  let model: string | null = null
  if (ctx.threadTitle && !threadTitleKo) {
    try {
      const r = await call(TITLE_SYSTEM, buildTitlePrompt(ctx.threadTitle), 'relevance-translate/title')
      const t = stripOutput(r.text)
      const c = checkTitle(ctx.threadTitle, t)
      if (c.ok) { threadTitleKo = t; model = r.model }
    } catch {
      // 제목은 곁들임이다. 실패하면 본문만 간다(화면은 원제를 그대로 보여 준다).
    }
  }

  let r: { text: string; model: string }
  try {
    r = await call(TRANSLATION_SYSTEM, buildTranslationPrompt(ctx.body), 'relevance-translate/text')
  } catch (e) {
    return { ...base, thread_title_ko: threadTitleKo, text_ko: null, status: 'failed', fail_reason: `호출 실패: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}`, model }
  }
  const text = stripOutput(r.text)
  const c = checkTranslation(ctx.body, text)
  if (!c.ok) return { ...base, thread_title_ko: threadTitleKo, text_ko: null, status: 'failed', fail_reason: `사후검사: ${c.reason}`, model: r.model }
  return { ...base, thread_title_ko: threadTitleKo, text_ko: text, status: 'ok', fail_reason: null, model: r.model }
}

export async function generateBackground(
  call: LlmCall,
  project: { id: string; product_elevator_pitch: string | null; competitor_url?: string | null },
  version = TRANSLATE_PROMPT_VERSION,
): Promise<BackgroundRow> {
  const pitch = (project.product_elevator_pitch ?? '').trim()
  const base = { project_id: project.id, prompt_version: version }
  if (!pitch) return { ...base, background: null, status: 'skipped', fail_reason: '제품 소개 없음', model: null }
  let r: { text: string; model: string }
  try {
    r = await call(BACKGROUND_SYSTEM, buildBackgroundPrompt({ pitch, competitorUrl: project.competitor_url ?? null }), 'relevance-translate/background')
  } catch (e) {
    return { ...base, background: null, status: 'failed', fail_reason: `호출 실패: ${(e instanceof Error ? e.message : String(e)).slice(0, 200)}`, model: null }
  }
  const text = stripOutput(r.text)
  const c = checkBackground(text)
  if (!c.ok) return { ...base, background: null, status: 'failed', fail_reason: `사후검사: ${c.reason}`, model: r.model }
  return { ...base, background: text, status: 'ok', fail_reason: null, model: r.model }
}
