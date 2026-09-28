// 외부 게시물 사후 등록 — 대시보드 "글 등록" 폼(app/dashboard/actions.ts createPost)의 external 경로.
//
// 왜: 파이프라인 초안 없이 사람이 Threads 에 직접 올린 글을 09-27 에는 SQL 백필(마이그 20260930000022)로
//   넣었다. 같은 일이 또 생길 때 마이그 없이 화면에서 넣게 한다(남헌 09-27 확정, reports/2026-09-27/ceo-staff-3tasks.md §3 Q3).
//
// 행 모양은 000022 와 같아야 한다 — 매처·성과 수집이 보는 필드가 그것이다:
//   - match-posts: posts.external_id 가 있는 Threads id 를 "이미 연결"로 보고 미연결 경고에서 뺀다.
//   - collect-metrics / collect-replies: status='published' ∧ published_at(14일 창) ∧ external_id 로 고른다.
//   그래서 status='published' · external_id · published_at · permalink 가 전부 있어야 하고,
//   published_via='external'(마이그 000021 CHECK), notes 는 '[external] …' 로 시작한다.
//
// ⛔ 발행 API 를 부르지 않는다(CLAUDE.md §10). 사람이 이미 올린 글의 id·링크를 받아 적는 것뿐이다.
// ⚠️ node 가 타입 스트리핑으로 직접 로드한다(scripts/threads-external-post-selftest.mjs). `@/` 별칭 금지.

import type { SupabaseClient } from '@supabase/supabase-js'

/** Threads Graph API media id — 000022 의 4건은 전부 17자리 숫자다. 퍼머링크 단축코드(영문)를 잘못 넣는 걸 막는다. */
const MEDIA_ID_RE = /^\d{15,20}$/
/** https://www.threads.com/@user/post/<shortcode> (threads.net 도 같은 게시물). 쿼리·해시·끝 슬래시는 떼고 본다. */
const PERMALINK_RE = /^https:\/\/(?:www\.)?threads\.(?:net|com)\/@[A-Za-z0-9._]{1,30}\/post\/([A-Za-z0-9_-]{5,40})$/

export type ExternalInput =
  | { kind: 'none' }
  | { kind: 'external'; externalId: string; permalink: string; shortcode: string }
  | { kind: 'invalid'; message: string }

/** 두 칸 다 비었으면 기존 사후 기록(none). 하나라도 있으면 둘 다 유효해야 external. */
export function parseExternalInput(rawId: string, rawLink: string): ExternalInput {
  const id = rawId.trim()
  const link = rawLink.trim()
  if (!id && !link) return { kind: 'none' }
  if (!id || !link) return { kind: 'invalid', message: '외부 게시물은 Threads 게시물 ID 와 퍼머링크를 둘 다 넣어야 합니다.' }
  if (!MEDIA_ID_RE.test(id)) {
    return { kind: 'invalid', message: `Threads 게시물 ID 형식이 아닙니다(숫자 15~20자리): ${id}` }
  }
  const permalink = link.replace(/[?#].*$/, '').replace(/\/+$/, '')
  const m = PERMALINK_RE.exec(permalink)
  if (!m) {
    return { kind: 'invalid', message: 'Threads 게시물 URL 형식이 아닙니다 — https://www.threads.com/@계정/post/코드' }
  }
  return { kind: 'external', externalId: id, permalink, shortcode: m[1] }
}

/** 퍼머링크의 단축코드. threads.net/threads.com·쿼리 차이를 넘어 같은 게시물인지 가른다. */
export function shortcodeOf(permalink: string | null | undefined): string | null {
  if (!permalink) return null
  return /\/post\/([A-Za-z0-9_-]+)/.exec(permalink)?.[1] ?? null
}

export type DuplicateCheck = { status: 'clear' } | { status: 'duplicate'; message: string } | { status: 'unknown'; message: string }

/** 같은 external_id 또는 같은 게시물 퍼머링크가 이미 있으면 거절. 조회 실패는 "없음"이 아니라 확인 불가(§7.1). */
export async function checkDuplicate(
  sb: SupabaseClient,
  ext: { externalId: string; shortcode: string },
): Promise<DuplicateCheck> {
  // ilike 는 넓게 긁고(_ 가 와일드카드라 느슨하다) 아래 JS 에서 정확히 다시 본다.
  const { data, error } = await sb
    .from('posts')
    .select('id, external_id, permalink')
    .or(`external_id.eq.${ext.externalId},permalink.ilike.*/post/${ext.shortcode}*`)
  if (error) return { status: 'unknown', message: `중복 확인 실패 — 확인하지 못해 저장하지 않았습니다: ${error.message}` }
  const hit = (data ?? []).find(r => r.external_id === ext.externalId || shortcodeOf(r.permalink) === ext.shortcode)
  if (!hit) return { status: 'clear' }
  return {
    status: 'duplicate',
    message: hit.external_id === ext.externalId
      ? `이 Threads 게시물 ID 는 이미 등록돼 있습니다 (${ext.externalId}).`
      : `이 퍼머링크의 게시물은 이미 등록돼 있습니다 (${ext.shortcode}).`,
  }
}

/** external 행에만 붙는 필드. 000022 와 같은 키·값 규약. */
export function externalFields(ext: { externalId: string; permalink: string }, who: string) {
  return {
    external_id: ext.externalId,
    permalink: ext.permalink,
    published_via: 'external' as const,
    notes: `[external] 파이프라인 초안 없음 — 외부에서 직접 게시한 글을 대시보드에서 사후 등록(${who}). Threads 게시물 ${ext.externalId}.`,
  }
}
