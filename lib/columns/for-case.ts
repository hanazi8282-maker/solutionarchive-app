// 케이스 상세(/library/<slug>)의 "더 알아보기" — 그 케이스를 근거로 쓴 **공개 칼럼**만 찾는다.
//
// 공개 조건은 /columns/read 와 같다: review_status='approved' (lib/columns/read.ts APPROVED).
// 미승인·기각 칼럼은 이 조회에서 아예 안 나온다 — 공개 화면에 초안 제목이 새면 안 된다.
// 본문은 싣지 않는다(slug·title 만) — 로그인 전 화면이고, 읽기는 /columns/read 의 몫이다.
//
// 3상태를 접지 않는다(CLAUDE.md §7.1): error(조회 실패) ≠ none(연결된 칼럼 0편).
// 이 파일은 '@/' 별칭을 쓰지 않는다 — scripts/case-column-link-selftest.mjs 가 node 로 직접 읽는다.

import type { SupabaseClient } from '@supabase/supabase-js'

export const APPROVED = 'approved' // content_columns_review_status_check: draft|approved|rejected

/** 버튼 1개 + 작은 링크 상한 3개. */
export const MORE_LIMIT = 3

export type CaseColumn = { slug: string; title: string }

export type CaseColumnsView =
  | { kind: 'none' }
  | { kind: 'error'; reason: string }
  | { kind: 'some'; lead: CaseColumn; more: CaseColumn[] }

export async function columnsForCase(sb: SupabaseClient, caseSlug: string): Promise<CaseColumnsView> {
  const { data, error } = await sb
    .from('content_columns')
    .select('slug,title')
    .eq('review_status', APPROVED)
    .eq('case_study_slug', caseSlug)
    // "가장 최근 공개" = published_at, 없으면 적재 시각. NULL 발행일이 맨 앞에 오지 않게.
    .order('published_at', { ascending: false, nullsFirst: false })
    .order('staged_at', { ascending: false })
    .limit(1 + MORE_LIMIT)
  if (error) return { kind: 'error', reason: error.message }
  const rows = (data ?? []) as CaseColumn[]
  if (rows.length === 0) return { kind: 'none' }
  return { kind: 'some', lead: rows[0], more: rows.slice(1, 1 + MORE_LIMIT) }
}
