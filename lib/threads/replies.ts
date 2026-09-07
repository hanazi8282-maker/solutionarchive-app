// 발행 글의 답글(댓글) 본문 수집 — 순수 로직.
//
// 네트워크는 fetchConversation 하나뿐이고, 나머지(upsert 계획·삭제 감지)는
// planReplyUpserts 로 떼어내 scripts/threads-replies-selftest.mjs 로 검증한다.
// 라우트(app/api/threads/collect-replies)는 이 계획을 실행만 한다.

import { readUsage, type ThreadsUsage } from './insights.ts'

const BASE = 'https://graph.threads.net'

// conversation 응답에서 받는 필드. 여기 없는 건 저장 안 된다.
// is_reply_owned_by_me — 내 계정이 단 답글인지(자기답글·후속).
// replied_to.id — 무엇에 달린 답글인지(중첩). 없으면 원글 직속.
const FIELDS = [
  'id', 'text', 'username', 'timestamp', 'permalink',
  'is_reply_owned_by_me', 'replied_to', 'hide_status', 'has_replies',
].join(',')

// 한 글당 최대 페이지. 저volume 계정이라 보통 1페이지로 끝나지만, 논란 글이
// 붙으면 늘어난다. 무한 루프 방지 상한.
const MAX_PAGES = 20

export interface RawReply {
  id: string
  text?: string
  username?: string
  timestamp?: string
  permalink?: string
  is_reply_owned_by_me?: boolean
  replied_to?: { id?: string }
  hide_status?: string
}

/**
 * GET /{mediaId}/conversation 을 페이지네이션으로 전부 읽는다.
 * conversation 은 대화 트리를 평탄화해 돌려준다(중첩 답글 포함).
 * 실패하면 throw — 라우트가 글 단위로 잡아 나머지는 계속 수집한다.
 */
export async function fetchConversation(
  mediaId: string,
  token: string,
  onUsage?: (u: ThreadsUsage) => void,
): Promise<RawReply[]> {
  const out: RawReply[] = []
  let url: string | null =
    `${BASE}/${mediaId}/conversation?fields=${FIELDS}&limit=100&access_token=${token}`

  for (let page = 0; page < MAX_PAGES && url; page++) {
    const res = await fetch(url)
    if (onUsage) {
      const u = readUsage(res)
      if (u) onUsage(u)
    }
    const json: any = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(`conversation ${mediaId} 실패 (HTTP ${res.status}): ${JSON.stringify(json)}`)
    }
    if (Array.isArray(json.data)) out.push(...(json.data as RawReply[]))
    url = json.paging?.next ?? null
  }
  return out
}

export interface ExistingReply {
  id: string
  text: string | null
  hide_status: string | null
}

export interface ReplyUpsert {
  id: string
  post_id: string
  parent_id: string | null
  author_username: string | null
  is_own: boolean
  text: string | null
  replied_at: string | null
  permalink: string | null
  hide_status: string | null
  raw: RawReply
}

export interface ReplyPlan {
  /** 새 답글 — INSERT (first_seen_at / last_seen_at 은 DB DEFAULT now()) */
  inserts: ReplyUpsert[]
  /** 이미 있는 답글 중 text 나 hide_status 가 바뀐 것 — UPDATE (+ last_seen_at) */
  updates: ReplyUpsert[]
  /** 이미 있고 내용도 그대로 — last_seen_at 만 갱신 */
  touchIds: string[]
  /**
   * 이번 응답에 안 나온, 우리가 갖고 있던 답글 id. 삭제됐거나 API 가 빠뜨린 것.
   * v1 은 지우지 않는다(오검출로 관측 기록이 사라지는 게 더 나쁘다). 목록만 돌려준다.
   */
  missingIds: string[]
}

/**
 * mediaId 원글에 대한 conversation 응답과 기존 저장분을 비교해 무엇을 쓸지 계획한다.
 * 순수 함수 — 여기서 조용히 틀리면 관측 데이터가 오염되므로 selftest 로 고정한다.
 *
 * @param rootMediaId  원글의 Threads media id (external_id). replied_to 가 이 값이면 직속 답글.
 */
export function planReplyUpserts(
  postId: string,
  rootMediaId: string,
  fetched: RawReply[],
  existing: ExistingReply[],
): ReplyPlan {
  const byId = new Map(existing.map(e => [e.id, e]))
  const seen = new Set<string>()
  const inserts: ReplyUpsert[] = []
  const updates: ReplyUpsert[] = []
  const touchIds: string[] = []

  for (const r of fetched) {
    if (!r.id) continue
    seen.add(r.id)

    const repliedToId = r.replied_to?.id ?? null
    const row: ReplyUpsert = {
      id: r.id,
      post_id: postId,
      // 원글에 직속이면 parent 는 없다. 다른 답글에 달렸으면 그 id.
      parent_id: repliedToId && repliedToId !== rootMediaId ? repliedToId : null,
      author_username: r.username ?? null,
      is_own: r.is_reply_owned_by_me === true,
      text: typeof r.text === 'string' ? r.text : null,
      replied_at: r.timestamp ?? null,
      permalink: r.permalink ?? null,
      hide_status: r.hide_status ?? null,
      raw: r,
    }

    const prev = byId.get(r.id)
    if (!prev) {
      inserts.push(row)
    } else if (prev.text !== row.text || prev.hide_status !== row.hide_status) {
      updates.push(row)
    } else {
      touchIds.push(r.id)
    }
  }

  const missingIds = existing.filter(e => !seen.has(e.id)).map(e => e.id)
  return { inserts, updates, touchIds, missingIds }
}
