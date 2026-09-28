// /relevance/* 화면의 읽기 두 가지. 쓰기는 app/relevance/actions.ts 한 곳뿐이다.
import type { createClient } from '../supabase/server'
import type { FeedbackRow } from './sample'

type Sb = NonNullable<Awaited<ReturnType<typeof createClient>>>

export const FEEDBACK_MIGRATION = '20260930000032_relevance_criteria_feedback.sql'
export const INFORMATIVE_MIGRATION = '20260930000031(product_informative)'
const PAGE = 1000

/**
 * 판정 행 전부. '*' 로 읽는다 — 000027/000031 컬럼이 없는 DB 에서도 죽지 않고, 키 유무로 3상태를 가른다.
 * PostgREST 기본 상한(1000행)에 잘리지 않게 끝까지 넘긴다. 한 쪽이라도 실패하면 전체 실패(§7.1).
 */
export async function loadAllVerdicts(sb: Sb): Promise<{ rows: FeedbackRow[] } | { error: string }> {
  const rows: FeedbackRow[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb.from('review_relevance_verdicts').select('*').order('input_id').range(from, from + PAGE - 1)
    if (error) return { error: `${error.code ?? ''} ${error.message}`.trim() }
    rows.push(...((data ?? []) as FeedbackRow[]))
    if (!data || data.length < PAGE) return { rows }
  }
}

/** 메모 테이블(000032) 3상태. 존재 확인은 head:true 로 하지 않는다 — 없는 테이블에도 204 를 준다. */
export async function feedbackTableState(sb: Sb): Promise<'present' | 'missing' | 'unknown'> {
  const { error } = await sb.from('relevance_criteria_feedback').select('id').limit(1)
  if (!error) return 'present'
  return isMissingRelation(error) ? 'missing' : 'unknown'
}

export const isMissingRelation = (e: { code?: string; message?: string }) =>
  e.code === 'PGRST205' || e.code === '42P01' || (/relevance_(criteria_feedback|translations|product_backgrounds)/.test(e.message ?? '') && /not find|does not exist/.test(e.message ?? ''))
export const isMissingColumn = (e: { code?: string }) => e.code === 'PGRST204' || e.code === '42703'

/**
 * 번역·배경 캐시(000035) 읽기. 화면에 올리는 것은 **본문 컬럼만**이다 — 판정 계열은 이 테이블에 없고 여기서도 고르지 않는다.
 * 3상태: present(행 맵) · missing(테이블 없음 = 마이그 전) · unknown(조회 실패). 0건과 못 읽음을 가른다(§7.1).
 */
export type CacheLoad<T> = { state: 'present'; rows: Map<string, T> } | { state: 'missing' } | { state: 'unknown'; error: string }

export type TranslationView = { text_ko: string | null; thread_title: string | null; thread_title_ko: string | null; thread_key: string | null; status: string }
export type BackgroundView = { background: string | null; status: string }

export async function loadTranslations(sb: Sb, inputIds: readonly string[]): Promise<CacheLoad<TranslationView>> {
  if (inputIds.length === 0) return { state: 'present', rows: new Map() }
  const { data, error } = await sb.from('relevance_translations').select('input_id, text_ko, thread_title, thread_title_ko, thread_key, status').in('input_id', inputIds)
  if (error) return isMissingRelation(error) ? { state: 'missing' } : { state: 'unknown', error: `${error.code ?? ''} ${error.message}`.trim() }
  return { state: 'present', rows: new Map((data ?? []).map((r) => [r.input_id as string, r as TranslationView])) }
}

export async function loadBackgrounds(sb: Sb, projectIds: readonly string[]): Promise<CacheLoad<BackgroundView>> {
  if (projectIds.length === 0) return { state: 'present', rows: new Map() }
  const { data, error } = await sb.from('relevance_product_backgrounds').select('project_id, background, status').in('project_id', projectIds)
  if (error) return isMissingRelation(error) ? { state: 'missing' } : { state: 'unknown', error: `${error.code ?? ''} ${error.message}`.trim() }
  return { state: 'present', rows: new Map((data ?? []).map((r) => [r.project_id as string, r as BackgroundView])) }
}
