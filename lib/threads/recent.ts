// 최근 Threads 게시물 읽기 — GET /me/threads.
//
// 매처 크론(app/api/threads/match-posts)과 대시보드의 "초안에 안 붙은 게시물" 목록이
// 같은 창(기간·개수)을 봐야 한다. 둘이 따로 호출하면 한쪽만 기간이 바뀌어
// "크론은 보는데 화면엔 없다"가 조용히 생긴다. 그래서 한 곳에 둔다.
//
// ⛔ 읽기만 한다(CLAUDE.md §10).

import type { ThreadsPost } from './match'

const BASE = 'https://graph.threads.net'

// 읽어올 게시물 수. 하루 4~5편 × 며칠치 + 자답글까지 감안한 여유값이다.
const FETCH_LIMIT = 50

// 이 기간보다 오래된 게시물은 보지 않는다. collect-metrics 가 14일 이내만
// 수집하므로 그보다 오래된 글을 지금 연결해도 성과 데이터가 붙지 않는다.
// (그런 초안은 대시보드에서 게시물 ID 를 직접 입력해 연결한다 — 기록 자체는 남길 수 있어야 하니까)
export const LOOKBACK_DAYS = 14

export type RecentThreads =
  | { ok: true; data: ThreadsPost[]; res: Response }
  | { ok: false; status: number; detail: unknown }

export async function fetchRecentThreads(accessToken: string): Promise<RecentThreads> {
  const since = Math.floor((Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000) / 1000)
  const url = new URL(`${BASE}/me/threads`)
  url.searchParams.set('fields', 'id,text,permalink,timestamp')
  url.searchParams.set('limit', String(FETCH_LIMIT))
  url.searchParams.set('since', String(since))
  url.searchParams.set('access_token', accessToken)

  const res = await fetch(url, { method: 'GET' })
  const json = await res.json().catch(() => ({}))

  // 200 이어도 data 배열이 없으면 실패다(§7.1 — 상태 코드로 성공을 판정하지 않는다).
  if (!res.ok || !Array.isArray(json.data)) return { ok: false, status: res.status, detail: json }
  return { ok: true, data: json.data as ThreadsPost[], res }
}
