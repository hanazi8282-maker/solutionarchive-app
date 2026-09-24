// 공개 신호 화면(/signals · /signals/community · /signals/card) 의 읽기 한 벌.
// 남헌 2026-09-25 위임 B항 — reports/2026-09-24/competitor-features-reestimate.md B1·B2·§F 7·8.
//
// 데이터: review_relevance_verdicts ⨝ analysis_inputs(⨝ review_sources · review_fingerprints) ⨝ analysis_projects.
// LLM 호출 0, 읽기만. 라벨(impact·frequency·community_signal·wtp_mentioned)은 T2 판정이 채운다
// (lib/analysis/relevance-judge.ts). 라벨이 NULL 이면 "모름"이다 — 'mid'·false 로 접지 않는다(§7.1).
//
// ★ 원문 재게시 원칙: 공개 화면에 원문을 통째로 싣지 않는다. 발췌 EXCERPT_MAX 자 + 출처 링크뿐이다.
//   `/library/[slug]` 블록 7(VOC 인용)을 비워 둔 것과 같은 원칙이다(그 파일 30-34행).
// ★ 3상태: 조회 실패('error')와 0건('ok' + 빈 배열)을 가른다. 화면은 둘을 다른 모양으로 그린다.
//
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다(scripts/signals-selftest.mjs). `@/` 별칭을 쓰지 않는다.

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  COMMUNITY_SIGNALS, LABEL_LEVELS, type CommunitySignal, type LabelLevel,
} from '../analysis/relevance-judge.ts'
import { extractStoryIdFromText, hnThreadUrl } from '../review/adapters/hackernews.ts'

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
  source_name: string | null
  /** 분석 대상 제품(analysis_projects.product_elevator_pitch). */
  project: string | null
  excerpt: string
  /** 원문을 볼 수 있는 곳. 만들 수 없으면 null — 지어내지 않는다. */
  link: string | null
}

export type Loaded<T> = { status: 'error'; reason: string } | ({ status: 'ok' } & T)

export interface FeedFilters {
  source: string | null
  signal: CommunitySignal | null
  impact: LabelLevel | null
  page: number
}

// ── 순수 함수 (selftest 대상) ───────────────────────────────────

const HN_HEADER = /^\s*\[HN:[^\]]*\]\s*/

/** 수집기가 붙인 머리말(`[HN: 제목 · URL]`)을 떼고 한 줄로 눕혀 EXCERPT_MAX 자로 자른다. */
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
  return null
}

const pick = <T extends string>(v: unknown, allowed: readonly T[]): T | null =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null

/** URL 질의 → 필터. 어휘 밖 값은 버리고 errors 에 적는다(조용히 무시하지 않는다). */
export function parseFeedQuery(sp: Record<string, string | string[] | undefined>): { filters: FeedFilters; errors: string[] } {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k][0] : sp[k]) ?? ''
  const errors: string[] = []
  const src = one('source').trim()
  const source = /^[a-z0-9_-]{1,40}$/.test(src) ? src : null
  if (src && !source) errors.push(`소스 "${src.slice(0, 40)}" 는 형식이 아니다`)
  const signal = pick(one('signal'), COMMUNITY_SIGNALS)
  if (one('signal') && !signal) errors.push(`신호 "${one('signal').slice(0, 20)}" 는 pain·demand·objection 이 아니다`)
  const impact = pick(one('impact'), LABEL_LEVELS)
  if (one('impact') && !impact) errors.push(`영향 "${one('impact').slice(0, 20)}" 는 high·mid·low 가 아니다`)
  const p = Number(one('page') || 1)
  const page = Number.isInteger(p) && p >= 1 ? Math.min(p, MAX_PAGE) : 1
  if (one('page') && page !== p) errors.push(`페이지 번호는 1~${MAX_PAGE} 이다`)
  return { filters: { source, signal, impact, page }, errors }
}

/** 기본값은 URL 에 안 적는다 — 파라미터 없는 첫 진입과 같은 화면이 된다. */
export function feedHref(f: FeedFilters, patch: Partial<FeedFilters>): string {
  const n = { ...f, page: 1, ...patch }
  const p = new URLSearchParams()
  if (n.source) p.set('source', n.source)
  if (n.signal) p.set('signal', n.signal)
  if (n.impact) p.set('impact', n.impact)
  if (n.page > 1) p.set('page', String(n.page))
  const s = p.toString()
  return s ? `/signals?${s}` : '/signals'
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ── 조회 ────────────────────────────────────────────────────────

const SELECT = [
  'input_id, judged_at, reason, impact, frequency, community_signal, wtp_mentioned',
  'analysis_projects(product_elevator_pitch)',
  'analysis_inputs!inner(source_key, raw_text, purged_at, review_sources(display_name), review_fingerprints(product_ref))',
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
    review_sources: { display_name: string | null } | null
    review_fingerprints: { product_ref: string | null }[] | null
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
    source_name: inp.review_sources?.display_name ?? inp.source_key,
    project: r.analysis_projects?.product_elevator_pitch ?? null,
    excerpt: excerptOf(inp.raw_text),
    link: sourceLinkOf(inp.source_key, inp.raw_text, inp.review_fingerprints?.[0]?.product_ref ?? null),
  }
}

/**
 * 공개 대상 행의 공통 조건: 사람 채점이 이기고(human_verdict), 없으면 LLM 판정이 relevant,
 * 원문이 아직 폐기되지 않은 것. count 를 원하면 exact 로 센다(HEAD 는 쓰지 않는다 — 없는 테이블도 204).
 */
function base(sb: SupabaseClient, withCount: boolean) {
  return sb
    .from('review_relevance_verdicts')
    .select(SELECT, withCount ? { count: 'exact' } : undefined)
    .or('human_verdict.eq.relevant,and(human_verdict.is.null,verdict.eq.relevant)')
    .is('analysis_inputs.purged_at', null)
}

const why = (e: { code?: string; message: string }) =>
  e.code === '42703' || e.code === 'PGRST204'
    ? `라벨 컬럼이 없다(${e.code}) — 마이그 20260930000014 미적용 환경`
    : `조회 실패: ${e.code ?? ''} ${e.message}`.trim()

export async function loadFeed(
  sb: SupabaseClient,
  f: FeedFilters,
): Promise<Loaded<{ items: SignalItem[]; total: number | null; sources: { key: string; name: string }[] | null }>> {
  let q = base(sb, true)
  if (f.source) q = q.eq('analysis_inputs.source_key', f.source)
  if (f.signal) q = q.eq('community_signal', f.signal)
  if (f.impact) q = q.eq('impact', f.impact)
  const from = (f.page - 1) * PAGE_SIZE
  const [{ data, error, count }, src] = await Promise.all([
    q.order('judged_at', { ascending: false }).order('input_id').range(from, from + PAGE_SIZE - 1),
    sb.from('review_sources').select('key, display_name').eq('enabled', true).order('key'),
  ])
  if (error) {
    console.error('[signals] feed query failed:', error.code, error.message)
    return { status: 'error', reason: why(error) }
  }
  if (src.error) console.error('[signals] review_sources query failed:', src.error.message)
  return {
    status: 'ok',
    items: ((data ?? []) as unknown as Raw[]).map(toItem),
    total: count ?? null,
    // 소스 목록을 못 읽으면 칩을 안 낸다(null). 빈 배열(= 소스 0곳)과 다르다.
    sources: src.error ? null : (src.data ?? []).map((s) => ({ key: s.key as string, name: (s.display_name as string) ?? s.key })),
  }
}

export async function loadColumns(
  sb: SupabaseClient,
): Promise<Loaded<{ columns: { signal: CommunitySignal; items: SignalItem[]; count: number }[]; relevantTotal: number | null }>> {
  const [all, ...cols] = await Promise.all([
    // 관련 행 전체 수 — "라벨 N / 관련 M" 을 사실로 적으려고. 한 행만 받는다.
    base(sb, true).limit(1),
    ...COMMUNITY_SIGNALS.map((s) =>
      base(sb, true).eq('community_signal', s).order('judged_at', { ascending: false }).order('input_id').limit(COLUMN_SIZE)),
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
