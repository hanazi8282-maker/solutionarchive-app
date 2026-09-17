// 칼럼 연재 편(content_columns.threads[]) → 매처·대시보드의 후보.
//
// 왜 필요한가 (2026-09-18 실측).
//   매처가 대조하는 후보는 posts(draft·pending_review)뿐이었다. 그런데 스레드로
//   발행되는 글에는 경로가 하나 더 있다: 칼럼에서 뗀 연재 편이다. 그 편은
//   content_columns.threads 안의 jsonb 원소로만 존재하고 posts 행이 없다.
//   그래서 게시물 18165008242467071(칼럼 beauty-of-joseon 1편의 발행본)은 매처
//   눈에 "어떤 초안과도 안 닮은 글"로 보였다. 후보에서 빠진 것을 닮지 않은 것으로
//   읽은 셈이다(§7.1 과 같은 종류의 실수다).
//
// ⛔ 이 편들은 **자동 연결 후보가 아니다.** 갱신할 posts 행이 없고, 매처는 새 행을
//    만들지 않는다(app/api/threads/match-posts/route.ts 규약). 분류·보고에만 쓴다.
//    연결하려면 먼저 scripts/column-threads-stage.mjs 로 편을 posts 에 스테이징한다.
//
// ⚠️ scripts/*.mjs 가 Node 타입 스트립으로 직접 import 한다. 값 import 를 넣지 마라
//    (`import type` 만 허용 — 스트립 시 지워진다).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { DraftRow } from './match'

/**
 * 편 하나의 posts.content_code 채번. **매처와 스테이징 스크립트가 같은 규칙을 써야 한다** —
 * 갈라지면 "이미 스테이징된 편"을 못 알아보고 매번 다시 올리거나, 연결된 편을
 * 계속 미연결로 보고한다.
 */
export const episodeCode = (slug: string, n: string | number): string =>
  `COL-${slug}-${String(n).padStart(2, '0')}`

export interface ColumnEpisode {
  columnId: string
  slug: string
  /** 편 번호. 파싱 결과 그대로의 문자열(“1”, “2” …). */
  n: string
  /** 칼럼 제목 + 편 번호. content_items.title 로 쓴다. */
  title: string
  body: string
  charCount: number
  code: string
}

export interface ColumnRow {
  id: string
  slug: string
  title: string
  threads: unknown
}

/**
 * jsonb 배열을 편 목록으로 편다. 형태는 column-check.mjs checkThreads 가 만든
 * `{n, body, char_count, warns}` 지만, 마이그레이션 주석은 `seq` 라고 적고 있다 —
 * 둘 다 받는다. 본문이 없는 원소는 후보가 될 수 없으므로 버린다.
 */
export function flattenEpisodes(rows: ColumnRow[]): ColumnEpisode[] {
  const out: ColumnEpisode[] = []
  for (const row of rows) {
    if (!Array.isArray(row.threads)) continue
    for (const raw of row.threads) {
      if (!raw || typeof raw !== 'object') continue
      const e = raw as Record<string, unknown>
      const body = typeof e.body === 'string' ? e.body : ''
      if (!body.trim()) continue
      const n = String(e.n ?? e.seq ?? '')
      if (!n) continue
      out.push({
        columnId: row.id,
        slug: row.slug,
        n,
        title: `${row.title} — ${n}편`,
        body,
        charCount: typeof e.char_count === 'number' ? e.char_count : [...body].length,
        code: episodeCode(row.slug, n),
      })
    }
  }
  return out
}

/** 분류·매칭에 넘길 후보 모양. id 는 편 코드다 — 화면·로그에 그대로 찍힌다. */
export const asCandidates = (episodes: ColumnEpisode[]): DraftRow[] =>
  episodes.map(e => ({ id: e.code, body: e.body }))

export type EpisodeLoad =
  | { episodes: ColumnEpisode[]; error: null }
  | { episodes: null; error: string }

/**
 * 사람이 승인한 칼럼의 편 전체. 실패를 빈 배열로 접지 않는다(§7.1) —
 * 조회 실패와 "편 0건"은 다른 사건이고, 전자를 0건으로 읽으면 칼럼 연재의
 * 발행본이 "파이프라인 외"로 오분류된다.
 */
export async function loadApprovedEpisodes(supabase: SupabaseClient): Promise<EpisodeLoad> {
  const { data, error } = await supabase
    .from('content_columns')
    .select('id, slug, title, threads')
    .eq('review_status', 'approved')
  if (error) return { episodes: null, error: `${error.code ?? ''} ${error.message}`.trim() }
  if (!Array.isArray(data)) return { episodes: null, error: '응답에 행 배열이 없다' }
  return { episodes: flattenEpisodes(data as ColumnRow[]), error: null }
}
