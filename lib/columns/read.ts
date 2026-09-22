// 공개 읽기 화면(/columns/read)의 조회 한 벌. 검수 화면(/columns)과 달리 승인된 칼럼만 본다.
//
// 3상태를 접지 않는다(CLAUDE.md §7.1): 조회 실패(reason)와 "승인된 칼럼 0건"(data=[])은
// 다른 사건이다. 화면은 앞쪽을 빨간 배너로, 뒤쪽을 빈 상태로 그린다.
//
// select('*') 인 이유: case_study_slug·published_at 은 20260929000003 미적용이면 없는 컬럼이다.
// 이름을 지정해 고르면 미적용 DB 에서 42703 으로 조회 전체가 죽는다.

import { createClient } from '@/lib/supabase/server'

export const APPROVED = 'approved' // content_columns_review_status_check: draft|approved|rejected

export type ColumnRead = {
  slug: string
  title: string
  body: string
  reader_type: string
  char_count: number
  staged_at: string
  published_at?: string | null
  case_study_slug?: string | null
}

export type Result<T> = { ok: true; data: T } | { ok: false; reason: string }

const NO_ENV = 'Supabase 환경변수 미설정 (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)'

export async function listApprovedColumns(): Promise<Result<ColumnRead[]>> {
  const sb = await createClient()
  if (!sb) return { ok: false, reason: NO_ENV }
  const { data, error } = await sb
    .from('content_columns').select('*').eq('review_status', APPROVED)
    .order('staged_at', { ascending: false })
  if (error) return { ok: false, reason: error.message }
  return { ok: true, data: (data ?? []) as ColumnRead[] }
}

/** 없는 slug 는 data=null 로 온다(maybeSingle) — 그건 조회 실패가 아니라 404 다. */
export async function getApprovedColumn(slug: string): Promise<Result<ColumnRead | null>> {
  const sb = await createClient()
  if (!sb) return { ok: false, reason: NO_ENV }
  const { data, error } = await sb
    .from('content_columns').select('*').eq('review_status', APPROVED).eq('slug', slug).maybeSingle()
  if (error) return { ok: false, reason: error.message }
  return { ok: true, data: (data ?? null) as ColumnRead | null }
}
