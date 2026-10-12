// YouTube 영상 메타(제목·채널) — `videos.list` 응답 해석과 오류 분류. 순수 함수만 둔다(네트워크·DB 없음).
//
// 왜: 댓글 수집(adapters/youtube.ts)은 commentThreads.list 만 써서 영상 제목이 없다. 판정(T2)이 "무슨 영상의
//     댓글인지" 모른 채 짧은 댓글을 보면 unknown 이 많다. 영상은 19개 남짓이라 videos.list 한 번(id 50개까지 = 1유닛)이면 된다.
// 영상 ID 의 자리: analysis_inputs.raw_text 머리말 `[YouTube 댓글 · <id>] `(adapters/youtube.ts toReview) ·
//     review_targets.product_ref / review_fingerprints.product_ref `v:<id>`(parseProductRef).
// 집행: scripts/youtube-video-titles.mjs · 표: youtube_videos(마이그 20261012000040).

/** videos.list 의 id 파라미터 상한. */
export const VIDEOS_LIST_MAX_IDS = 50
/** description 은 앞부분만 저장한다(판정 맥락용 — 전문이 필요 없다). */
export const DESCRIPTION_HEAD_CHARS = 500

export interface YoutubeVideoRow {
  video_id: string
  title: string
  channel: string | null
  description_head: string | null
}

const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

/** 중복·형식 오류를 걸러 50개씩 자른다. 순서는 처음 나온 순서. */
export function chunkVideoIds(ids: readonly string[], size = VIDEOS_LIST_MAX_IDS): string[][] {
  const uniq = [...new Set(ids.map((s) => String(s ?? '').trim()).filter((s) => VIDEO_ID.test(s)))]
  const out: string[][] = []
  for (let i = 0; i < uniq.length; i += size) out.push(uniq.slice(i, i + size))
  return out
}

/**
 * videos.list(part=snippet) 응답 → 행. 못 읽으면 null(= 구조 이상 — "0건"과 가른다, §7.1).
 * 제목이 없는 항목은 버리고 `missing` 에 남긴다. 요청했는데 응답에 없는 id(비공개·삭제)도 `missing` 이다.
 */
export function parseVideosList(body: string, requested: readonly string[]): { rows: YoutubeVideoRow[]; missing: string[] } | null {
  let doc: unknown
  try {
    doc = JSON.parse(body)
  } catch {
    return null
  }
  const items = (doc as { items?: unknown })?.items
  if (!Array.isArray(items)) return null

  const rows: YoutubeVideoRow[] = []
  for (const it of items) {
    const o = it && typeof it === 'object' ? (it as Record<string, unknown>) : null
    const id = typeof o?.id === 'string' ? o.id : null
    const sn = o?.snippet && typeof o.snippet === 'object' ? (o.snippet as Record<string, unknown>) : null
    const title = typeof sn?.title === 'string' ? sn.title.trim() : ''
    if (!id || !title) continue
    const channel = typeof sn?.channelTitle === 'string' && sn.channelTitle.trim() ? sn.channelTitle.trim() : null
    const desc = typeof sn?.description === 'string' ? Array.from(sn.description.trim()).slice(0, DESCRIPTION_HEAD_CHARS).join('') : ''
    rows.push({ video_id: id, title, channel, description_head: desc || null })
  }
  const got = new Set(rows.map((r) => r.video_id))
  return { rows, missing: requested.filter((id) => !got.has(id)) }
}

/** 쿼터 계열 reason. 이건 기다리면 풀린다 — 우회하지 않고 멈춘다. */
const QUOTA_REASONS = new Set(['quotaexceeded', 'ratelimitexceeded', 'dailylimitexceeded', 'userratelimitexceeded'])

export type VideosApiError = { kind: 'quota' | 'policy' | 'other'; reason: string | null }

/**
 * 비정상 응답 분류. 403 중 쿼터가 아닌 것(forbidden · accessNotConfigured · API 서비스 약관/정책 계열)은
 * 전부 `policy` — 사람이 봐야 하는 경고다. 다른 키·다른 경로로 다시 시도하지 않는다.
 */
export function classifyVideosError(status: number, body: string): VideosApiError {
  let reason: string | null = null
  try {
    const err = (JSON.parse(body) as { error?: { errors?: { reason?: unknown }[]; status?: unknown } })?.error
    const r = err?.errors?.[0]?.reason ?? err?.status
    reason = typeof r === 'string' ? r : null
  } catch {
    // 본문이 JSON 이 아니면 reason 은 모른다(null). 아래 상태 코드로만 가른다.
  }
  const low = (reason ?? '').toLowerCase()
  if (QUOTA_REASONS.has(low) || status === 429) return { kind: 'quota', reason }
  if (status === 403) return { kind: 'policy', reason }
  return { kind: 'other', reason }
}

/** 판정 프롬프트에 붙일 한 줄. 제목이 없으면 null(아무것도 붙이지 않는다 — 없는 제목을 지어내지 않는다). */
export function videoTitleLine(v: { title?: string | null; channel?: string | null } | null | undefined): string | null {
  const flat = (s: string | null | undefined) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)
  const title = flat(v?.title)
  if (!title) return null
  const channel = flat(v?.channel)
  return channel ? `영상 제목: ${title} (채널: ${channel})` : `영상 제목: ${title}`
}
