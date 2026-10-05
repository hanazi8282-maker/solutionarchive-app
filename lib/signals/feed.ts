// 공개 VOC 화면(2026-10-01 `/signals` 에서 개명 — /voc · /voc/community · /voc/card) 의 읽기 한 벌.
// 남헌 2026-09-25 위임 B항 — reports/2026-09-24/competitor-features-reestimate.md B1·B2·§F 7·8.
//
// 데이터: review_relevance_verdicts ⨝ analysis_inputs(⨝ review_sources · review_fingerprints) ⨝ analysis_projects.
// LLM 호출 0, 읽기만. 라벨(impact·frequency·community_signal·wtp_mentioned)은 T2 판정이 채운다
// (lib/analysis/relevance-judge.ts). 라벨이 NULL 이면 "모름"이다 — 'mid'·false 로 접지 않는다(§7.1).
//
// ★ 원문 재게시 원칙: 공개 화면에 원문을 통째로 싣지 않는다. 발췌 EXCERPT_MAX 자 + 출처 링크뿐이다.
//   → 2026-10-05 D안으로 더 좁혔다: 발췌는 quote_allowed=true 소스만 한 문장, 소스 이름·링크는 모든 소스 비표시(quoteOf).
//   `/library/[slug]` 블록 7(VOC 인용)을 비워 둔 것과 같은 원칙이다(그 파일 30-34행).
// ★ 3상태: 조회 실패('error')와 0건('ok' + 빈 배열)을 가른다. 화면은 둘을 다른 모양으로 그린다.
//
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다(scripts/signals-selftest.mjs). `@/` 별칭을 쓰지 않는다.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  COMMUNITY_SIGNALS, LABEL_LEVELS, type CommunitySignal, type LabelLevel,
} from '../analysis/relevance-judge.ts'
import { extractStoryIdFromText, hnThreadUrl } from '../review/adapters/hackernews.ts'
import { sourceUrlOf } from '../review/types.ts'
import { isSourceHostUrl, postUrlOfRef } from '../review/target-ref.ts'
// 종류 축은 /library 와 한 벌이다(남헌 2026-09-23: SaaS 창업가 대상, 소비재는 숨기되 지우지 않는다).
import { DEFAULT_SEARCH_KIND, type SearchKind } from '../cases/search.ts'
import { productKindOf } from '../cases/advisor.ts'
import { BUSINESS_MODEL } from '../cases/draft.ts'
import { firstSentence } from '../analysis/evidence-quotes.ts'

/**
 * review_sources.quote_allowed 컬럼(마이그 20261005000001)이 적용됐나. 적용 확인(information_schema) 뒤에 true 로 바꾼다.
 * false 인 동안은 어느 소스도 허용으로 확인할 수 없으므로 **발췌를 전부 비운다**(fail-closed, D안 2026-10-05).
 * 미적용 상태에서 true 로 두면 /voc 조회 전체가 42703 으로 죽는다(POSTS_PILLAR_COLUMN_READY 와 같은 패턴).
 */
export const QUOTE_POLICY_COLUMN_READY = false

/** 발췌 상한(글자). 원문 재게시가 되지 않을 만큼 짧게 — 보고에 가정으로 적은 값이다. */
export const EXCERPT_MAX = 140
/** 피드 한 페이지. */
export const PAGE_SIZE = 50
/** 3열 화면의 칼럼당 카드 수. 건수는 따로 센다. */
export const COLUMN_SIZE = 12
/** 페이지 번호 상한 — 깊은 offset 스캔을 익명에게 열어 두지 않는다. */
export const MAX_PAGE = 40

export const SIGNAL_LABEL: Record<CommunitySignal, string> = {
  pain: '겪는 문제',
  demand: '원하는 것',
  objection: '안 쓰는 이유',
}
export const LEVEL_LABEL: Record<LabelLevel, string> = { high: '높음', mid: '보통', low: '낮음' }

export interface SignalItem {
  input_id: string
  judged_at: string
  reason: string | null
  impact: LabelLevel | null
  frequency: LabelLevel | null
  community_signal: CommunitySignal | null
  wtp_mentioned: boolean | null
  source_key: string | null
  /** 분석 대상 제품(analysis_projects.product_elevator_pitch). */
  project: string | null
  /**
   * 원문 직접 인용 — quote_allowed=true 로 **확인된** 소스만, 한 문장(EXCERPT_MAX 자 이내). 그 밖은 빈 문자열.
   * 소스 이름·원문 링크는 고객 화면에 싣지 않는다(D안 2026-10-05, 모든 소스 공통) — 필드 자체를 없앴다.
   * 내부 보존은 DB(analysis_inputs.source_key·source_url·raw_text 머리말)에 그대로다.
   */
  excerpt: string
}

export type Loaded<T> = { status: 'error'; reason: string } | ({ status: 'ok' } & T)

/**
 * kind='saas' 일 때 남기는 analysis_projects.business_model 값. /library 는 행마다
 * `productKindOf(business_model) === 'software'` 로 거르는데, 여기는 DB 에서 걸러야 건수가 맞아서
 * 같은 판정을 어휘 전체에 돌려 값 목록으로 편다 — 산식을 두 벌 만들지 않는다(지금은 ['SAAS']).
 * NULL(미기재)은 productKindOf 가 physical 로 보므로 여기서도 숨는다.
 */
export const SAAS_BUSINESS_MODELS: readonly string[] = BUSINESS_MODEL.filter((m) => productKindOf(m) === 'software')

export interface FeedFilters {
  kind: SearchKind
  source: string | null
  signal: CommunitySignal | null
  impact: LabelLevel | null
  page: number
}

// ── 순수 함수 (selftest 대상) ───────────────────────────────────

/** 고객 화면 발췌. 허용이 **true 로 확인된** 경우만 한 문장 — false·null(모름)은 빈 문자열(§7.1). */
export function quoteOf(text: string | null | undefined, quoteAllowed: boolean | null | undefined): string {
  return quoteAllowed === true ? firstSentence(excerptOf(text, Number.MAX_SAFE_INTEGER), EXCERPT_MAX) : ''
}

const HN_HEADER = /^\s*\[(?:HN|SRC):[^\]]*\]\s*/

/** 수집기가 붙인 머리말(`[HN: 제목 · URL]` · `[SRC: URL]`)을 떼고 한 줄로 눕혀 EXCERPT_MAX 자로 자른다. */
export function excerptOf(text: string | null | undefined, max = EXCERPT_MAX): string {
  const flat = String(text ?? '').replace(HN_HEADER, '').replace(/\s+/g, ' ').trim()
  const chars = Array.from(flat) // 코드포인트 단위 — 이모지·한글 조합을 반으로 자르지 않는다
  return chars.length <= max ? flat : `${chars.slice(0, max - 1).join('').trimEnd()}…`
}

/**
 * 출처 링크. 글 단위 URL 컬럼이 스키마에 없어서(analysis_inputs 에 url 이 없다) 소스별로 되살린다.
 *  - hackernews: 본문 머리말의 스레드 URL(수집기가 심는다 — hackernews.ts hnThreadUrl)
 *  - youtube:    지문 product_ref `v:<영상ID>` → 영상
 *  - danawa:     지문 product_ref `<pcode>` → 상품 페이지
 *  - 본문 `[SRC: URL]` 머리말(2026-10-01~, 러너가 심는다 — types.ts withSourceUrl): 그 소스 호스트일 때만.
 *    게시판 순회(velog·disquiet·inflearn·yozm·indiehackers)의 글 주소는 이것뿐이다.
 *  - 커뮤니티 `url:<경로>` 타깃: 지문 product_ref → 어댑터 호스트 + 경로(target-ref.ts postUrlOfRef).
 * 그 밖은 null. 목록 URL·검색 URL 로 채우지 않는다 — "이 글"의 출처가 아니기 때문이다.
 */
export function sourceLinkOf(sourceKey: string | null, text: string | null, productRef: string | null): string | null {
  if (sourceKey === 'hackernews') {
    const id = extractStoryIdFromText(text ?? '')
    return id ? `https://${hnThreadUrl(id)}` : null
  }
  const ref = (productRef ?? '').trim()
  if (sourceKey === 'youtube') {
    const m = /^v:([A-Za-z0-9_-]{11})$/.exec(ref)
    return m ? `https://www.youtube.com/watch?v=${m[1]}` : null
  }
  if (sourceKey === 'danawa') return /^\d+$/.test(ref) ? `https://prod.danawa.com/info/?pcode=${ref}` : null
  const tagged = sourceUrlOf(text)
  if (tagged && isSourceHostUrl(sourceKey, tagged)) return tagged
  return postUrlOfRef(sourceKey, ref)
}

const pick = <T extends string>(v: unknown, allowed: readonly T[]): T | null =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null

/** URL 질의 → 필터. 어휘 밖 값은 버리고 errors 에 적는다(조용히 무시하지 않는다). */
export function parseFeedQuery(sp: Record<string, string | string[] | undefined>): { filters: FeedFilters; errors: string[] } {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) ?? ''
  const errors: string[] = []
  // 2026-10-01 남헌: "소비재 포함" 필터 제거 — 공개 VOC 는 기본값(SaaS만) 하나다. 옛 링크의 ?kind=all 도
  //   기본값으로 되돌리되 조용히 떨어지지 않고 사유를 남긴다(/library parseSearchQuery 와 같은 규칙).
  //   다시 넣을 때는 여기서 SEARCH_KINDS 를 받으면 된다 — 조회부(kind 인자)는 그대로 두었다.
  const rawKind = one('kind').trim().toLowerCase()
  const kind: SearchKind = DEFAULT_SEARCH_KIND
  if (rawKind && rawKind !== kind) errors.push(`kind "${rawKind.slice(0, 20)}" 는 지금 지원하지 않는다(소비재 포함 보기 없음)`)
  const src = one('source').trim()
  const source = /^[a-z0-9_-]{1,40}$/.test(src) ? src : null
  if (src && !source) errors.push(`소스 "${src.slice(0, 40)}" 는 형식이 아니다`)
  const signal = pick(one('signal'), COMMUNITY_SIGNALS)
  if (one('signal') && !signal) errors.push(`VOC 유형 "${one('signal').slice(0, 20)}" 는 pain·demand·objection 이 아니다`)
  const impact = pick(one('impact'), LABEL_LEVELS)
  if (one('impact') && !impact) errors.push(`영향 "${one('impact').slice(0, 20)}" 는 high·mid·low 가 아니다`)
  const p = Number(one('page') || 1)
  const page = Number.isInteger(p) && p >= 1 ? Math.min(p, MAX_PAGE) : 1
  if (one('page') && page !== p) errors.push(`페이지 번호는 1~${MAX_PAGE} 이다`)
  return { filters: { kind, source, signal, impact, page }, errors }
}

/** 기본값은 URL 에 안 적는다 — 파라미터 없는 첫 진입과 같은 화면이 된다. */
export function feedHref(f: FeedFilters, patch: Partial<FeedFilters>): string {
  const n = { ...f, page: 1, ...patch }
  const p = new URLSearchParams()
  if (n.kind !== DEFAULT_SEARCH_KIND) p.set('kind', n.kind)
  if (n.source) p.set('source', n.source)
  if (n.signal) p.set('signal', n.signal)
  if (n.impact) p.set('impact', n.impact)
  if (n.page > 1) p.set('page', String(n.page))
  const s = p.toString()
  return s ? `/voc?${s}` : '/voc'
}

/**
 * 소스 칩 건수를 세려고 읽는 관련 행 상한. PostgREST 에 group by 가 없어 행을 받아 앱에서 센다.
 * Supabase 기본 max-rows(1000)와 같게 둔다 — 그보다 크게 적어도 서버가 1000 에서 자른다.
 * ponytail: 행 수에 비례해 읽는다. 관련 행이 상한을 넘으면 건수는 "집계 불가"로 떨어진다(잘린 걸
 *   세지 않는다) — 그때 RPC(마이그 필요)로 옮긴다.
 */
export const SOURCE_COUNT_CAP = 1000

/**
 * 받은 행에서 소스별 건수를 센다. 다 못 받았으면(total 모름 · 잘림) null — 일부만 센 값을
 * 건수로 내보내지 않는다(§7.1).
 */
export function countBySource(rows: { source_key: string | null }[] | null, total: number | null): Record<string, number> | null {
  if (!rows || total == null || rows.length < total) return null
  const n: Record<string, number> = {}
  for (const r of rows) if (r.source_key) n[r.source_key] = (n[r.source_key] ?? 0) + 1
  return n
}

/**
 * 칩에 낼 소스. 건수를 셌으면 1건 이상인 소스만(+ 지금 고른 소스는 0건이어도 남긴다 — 안 그러면
 * 해제할 손잡이가 사라진다). 못 셌으면 전부 내되 count 없이(숫자 자리 없음 ≠ 0).
 */
export function sourceChips(
  sources: { key: string; name: string }[],
  counts: Record<string, number> | null,
  active: string | null,
): { key: string; name: string; count?: number }[] {
  if (!counts) return sources
  return sources
    .filter((s) => (counts[s.key] ?? 0) > 0 || s.key === active)
    .map((s) => ({ ...s, count: counts[s.key] ?? 0 }))
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ── 조회 ────────────────────────────────────────────────────────

const SELECT = [
  'input_id, judged_at, reason, impact, frequency, community_signal, wtp_mentioned',
  // !inner — kind 필터가 임베드 컬럼(business_model)에 걸려야 행이 걸러진다(아니면 임베드만 null 이 된다).
  'analysis_projects!inner(product_elevator_pitch, business_model)',
  // 소스 이름·지문(product_ref, 링크 재료)은 더 읽지 않는다 — 고객 화면에 안 내므로(D안). 미적용이면 key 만 임베드한다.
  `analysis_inputs!inner(source_key, raw_text, purged_at, review_sources(${QUOTE_POLICY_COLUMN_READY ? 'quote_allowed' : 'key'}))`,
].join(', ')

type Raw = {
  input_id: string
  judged_at: string
  reason: string | null
  impact: string | null
  frequency: string | null
  community_signal: string | null
  wtp_mentioned: boolean | null
  analysis_projects: { product_elevator_pitch: string | null } | null
  analysis_inputs: {
    source_key: string | null
    raw_text: string | null
    review_sources: { quote_allowed?: boolean | null } | null
  }
}

function toItem(r: Raw): SignalItem {
  const inp = r.analysis_inputs
  return {
    input_id: r.input_id,
    judged_at: r.judged_at,
    reason: r.reason,
    impact: pick(r.impact, LABEL_LEVELS),
    frequency: pick(r.frequency, LABEL_LEVELS),
    community_signal: pick(r.community_signal, COMMUNITY_SIGNALS),
    wtp_mentioned: typeof r.wtp_mentioned === 'boolean' ? r.wtp_mentioned : null,
    source_key: inp.source_key,
    project: r.analysis_projects?.product_elevator_pitch ?? null,
    excerpt: quoteOf(inp.raw_text, inp.review_sources?.quote_allowed),
  }
}

/**
 * 공개 대상 행의 공통 조건: 사람 채점이 이기고(human_verdict), 없으면 LLM 판정이 relevant,
 * 원문이 아직 폐기되지 않은 것. count 를 원하면 exact 로 센다(HEAD 는 쓰지 않는다 — 없는 테이블도 204).
 */
function base(sb: SupabaseClient, withCount: boolean, kind: SearchKind = 'all', select = SELECT) {
  const q = sb
    .from('review_relevance_verdicts')
    .select(select, withCount ? { count: 'exact' } : undefined)
    .or('human_verdict.eq.relevant,and(human_verdict.is.null,verdict.eq.relevant)')
    .is('analysis_inputs.purged_at', null)
  return kind === 'saas' ? q.in('analysis_projects.business_model', [...SAAS_BUSINESS_MODELS]) : q
}

/** kind='saas' 로 숨긴 건수 = 같은 조건의 전체 − SaaS. 못 셌으면 null(0 과 섞지 않는다). */
const hiddenOf = (all: { count: number | null; error: unknown } | null, shown: number | null) =>
  all && !all.error && all.count != null && shown != null ? Math.max(0, all.count - shown) : null

/** 소스 건수용 — 필터가 걸리는 임베드(!inner 두 개)만 남기고 나머지 컬럼은 뺀다. */
const COUNT_SELECT = 'input_id, analysis_projects!inner(business_model), analysis_inputs!inner(source_key, purged_at)'

/** 소스 칩 건수 조회 — 목록과 같은 kind·신호·영향 조건, 소스 조건만 제외. 순수 조립이라 selftest 가 형태를 고정한다. */
export function sourceCountQuery(sb: SupabaseClient, f: Pick<FeedFilters, 'kind' | 'signal' | 'impact'>, select = COUNT_SELECT) {
  let q = base(sb, true, f.kind, select)
  if (f.signal) q = q.eq('community_signal', f.signal)
  if (f.impact) q = q.eq('impact', f.impact)
  return q
}

const why = (e: { code?: string; message: string }) =>
  e.code === '42703' || e.code === 'PGRST204'
    ? `라벨 컬럼이 없다(${e.code}) — 마이그 20260930000014 미적용 환경`
    : `조회 실패: ${e.code ?? ''} ${e.message}`.trim()

export async function loadFeed(
  sb: SupabaseClient,
  f: FeedFilters,
): Promise<Loaded<{
  items: SignalItem[]; total: number | null; hiddenConsumer: number | null; sources: { key: string; name: string }[] | null
  /** 현재 kind·신호·영향 필터 기준 소스별 관련 판정 건수(소스 필터만 무관). null = 못 셌다. */
  sourceCounts: Record<string, number> | null
}>> {
  const scoped = (kind: SearchKind) => {
    let q = base(sb, true, kind)
    if (f.source) q = q.eq('analysis_inputs.source_key', f.source)
    if (f.signal) q = q.eq('community_signal', f.signal)
    if (f.impact) q = q.eq('impact', f.impact)
    return q
  }
  const from = (f.page - 1) * PAGE_SIZE
  const [{ data, error, count }, src, all, bysrc] = await Promise.all([
    scoped(f.kind).order('judged_at', { ascending: false }).order('input_id').range(from, from + PAGE_SIZE - 1),
    sb.from('review_sources').select('key, display_name').eq('enabled', true).order('key'),
    // 숨긴 소비재 건수용 — kind=saas 일 때만. 한 행만 받는다.
    f.kind === 'saas' ? scoped('all').limit(1) : Promise.resolve(null),
    // 소스 칩 건수 — kind + 신호·영향 필터를 건다(남헌 2026-09-25 결정: 칩 숫자가 지금 보이는 목록과 맞아야 한다).
    //   소스 필터만 뺀다 — 칩은 소스를 고르는 손잡이라 다른 소스 칩이 0 으로 사라지면 안 된다. 한 번에 읽어 앱에서 센다.
    sourceCountQuery(sb, f, COUNT_SELECT).range(0, SOURCE_COUNT_CAP - 1),
  ])
  if (error) {
    console.error('[signals] feed query failed:', error.code, error.message)
    return { status: 'error', reason: why(error) }
  }
  if (src.error) console.error('[signals] review_sources query failed:', src.error.message)
  if (bysrc.error) console.error('[signals] source count query failed:', bysrc.error.code, bysrc.error.message)
  const sourceCounts = bysrc.error ? null : countBySource(
    ((bysrc.data ?? []) as unknown as { analysis_inputs: { source_key: string | null } }[]).map((r) => r.analysis_inputs),
    bysrc.count ?? null,
  )
  if (!bysrc.error && !sourceCounts) console.error('[signals] source count truncated:', bysrc.data?.length, '/', bysrc.count)
  return {
    status: 'ok',
    items: ((data ?? []) as unknown as Raw[]).map(toItem),
    total: count ?? null,
    hiddenConsumer: f.kind === 'saas' ? hiddenOf(all, count ?? null) : 0,
    // 소스 목록을 못 읽으면 칩을 안 낸다(null). 빈 배열(= 소스 0곳)과 다르다.
    sourceCounts,
    sources: src.error ? null : (src.data ?? []).map((s) => ({ key: s.key as string, name: (s.display_name as string) ?? s.key })),
  }
}

export async function loadColumns(
  sb: SupabaseClient,
  kind: SearchKind,
): Promise<Loaded<{
  columns: { signal: CommunitySignal; items: SignalItem[]; count: number }[]
  relevantTotal: number | null
  /** kind=saas 로 숨긴 **라벨 붙은** 소비재 행 수. null = 못 셌다. */
  hiddenConsumer: number | null
}>> {
  const [all, labeledAll, ...cols] = await Promise.all([
    // 관련 행 전체 수(현재 kind 기준) — "라벨 N / 관련 M" 을 사실로 적으려고. 한 행만 받는다.
    base(sb, true, kind).limit(1),
    kind === 'saas' ? base(sb, true, 'all').not('community_signal', 'is', null).limit(1) : Promise.resolve(null),
    ...COMMUNITY_SIGNALS.map((s) =>
      base(sb, true, kind).eq('community_signal', s).order('judged_at', { ascending: false }).order('input_id').limit(COLUMN_SIZE)),
  ])
  const failed = cols.find((c) => c.error)
  if (failed?.error) {
    console.error('[signals] column query failed:', failed.error.code, failed.error.message)
    return { status: 'error', reason: why(failed.error) }
  }
  // 칼럼 건수를 못 셌으면 0 으로 접지 않는다 — 실패로 올린다.
  if (cols.some((c) => c.count == null)) return { status: 'error', reason: '칼럼 건수를 세지 못했다(count 누락)' }
  return {
    status: 'ok',
    columns: COMMUNITY_SIGNALS.map((signal, i) => ({
      signal,
      items: ((cols[i].data ?? []) as unknown as Raw[]).map(toItem),
      count: cols[i].count as number,
    })),
    relevantTotal: all.error ? null : (all.count ?? null),
    hiddenConsumer: kind === 'saas' ? hiddenOf(labeledAll, cols.reduce((n, c) => n + (c.count as number), 0)) : 0,
  }
}

/** 카드 한 건. 공개 대상이 아니면(무관·폐기·없음) 'ok' + null 이다 — 화면은 404 로 낸다. */
export async function loadCard(sb: SupabaseClient, id: string): Promise<Loaded<{ item: SignalItem | null }>> {
  const { data, error } = await base(sb, false).eq('input_id', id).maybeSingle()
  if (error) {
    console.error('[signals] card query failed:', error.code, error.message)
    return { status: 'error', reason: why(error) }
  }
  return { status: 'ok', item: data ? toItem(data as unknown as Raw) : null }
}
