// [v71cu S8-2] 유튜브 q:(검색어)·ch:(채널) 타깃 확장기 — 추가 전용. 기존 v: 어댑터(adapters/youtube.ts)는 그대로 두고,
// q:/ch: 가 "새 영상 찾기"만 맡아 v: 타깃으로 등록한다. 댓글 수집은 기존 러너가 v: 로 한다.
// 쿼터 보호: 모든 API 호출 직전에 reserve() 가 api_quota_log 를 먼저 올린다(호출 뒤 기록 아님 — 죽어도 과소 집계가 없다).
//   한도에 닿으면 reserve 가 false → 즉시 중단. 403·429 응답도 즉시 중단(재시도·우회 없음).
import { parseProductRef as parseVideoRef, parseChannelRef } from './adapters/youtube.ts'

export const SEARCH_CAP_DEFAULT = 60
export const UNITS_CAP_DEFAULT = 2000
/** 야간 수집 러너(commentThreads, review_sources.daily_request_cap=200)는 api_quota_log 에 안 적는다 → 'other' 한도에서 미리 떼어 둔다. */
export const COMMENT_RESERVE_DEFAULT = 200
export const MIN_COMMENTS = 30

export type Bucket = 'search' | 'other'

/** `q:<검색어>` → 검색어(공백 정리, 2~100자). 아니면 null. */
export function parseQueryRef(ref: string): string | null {
  const raw = (ref ?? '').trim()
  if (!raw.toLowerCase().startsWith('q:')) return null
  const q = raw.slice(2).trim().replace(/\s+/g, ' ')
  return q.length >= 2 && q.length <= 100 ? q : null
}

/** 채널 ID(UC…) → 업로드 재생목록 ID(UU…). 재생목록 호출은 1유닛. */
export const uploadsPlaylistId = (channelId: string): string => 'UU' + channelId.slice(2)

export interface QuotaStore {
  get(bucket: Bucket): Promise<number>
  set(bucket: Bucket, used: number, limit: number): Promise<void>
}

/** 한도 = {search, other}. other 는 호출자가 이미 COMMENT_RESERVE 를 뺀 값을 넘긴다. */
export function makeQuota(store: QuotaStore, caps: Record<Bucket, number>) {
  return {
    async reserve(bucket: Bucket): Promise<boolean> {
      const used = await store.get(bucket)
      if (used + 1 > caps[bucket]) return false
      await store.set(bucket, used + 1, caps[bucket])
      return true
    },
  }
}

export interface ExpandTarget { id: string; projectId: string; productRef: string; label: string }
export interface ExpandDeps {
  quota: { reserve(bucket: Bucket): Promise<boolean> }
  fetchJson(url: string): Promise<{ status: number; json: any }>
  existing(videoRefs: string[]): Promise<Set<string>>
  register(v: { videoId: string; projectId: string; label: string }): Promise<boolean>
  maxNewVideos: number
  log?(s: string): void
}
export interface ExpandResult { calls: Record<Bucket, number>; registered: number; skippedDup: number; skippedFewComments: number; stopped: string | null; touched: string[] }

const API = 'https://www.googleapis.com/youtube/v3'

/** 호출 1회: 쿼터 예약 → fetch. 한도·403·429 면 {stop}, 그 밖 비정상 상태는 {skip}, 정상이면 {json}. */
async function call(bucket: Bucket, url: string, deps: ExpandDeps, r: ExpandResult): Promise<{ stop: string } | { json: any } | { skip: number }> {
  if (!(await deps.quota.reserve(bucket))) return { stop: `${bucket} 일 한도 도달` }
  r.calls[bucket]++
  const { status, json } = await deps.fetchJson(url)
  if (status === 403 || status === 429) return { stop: `HTTP ${status} (쿼터·차단) — 그날은 끝` }
  if (status < 200 || status >= 300) return { skip: status }
  return { json }
}

async function registerFrom(videoIds: string[], t: ExpandTarget, deps: ExpandDeps, r: ExpandResult): Promise<string | null> {
  const ids = [...new Set(videoIds.filter((id) => parseVideoRef(`v:${id}`)))].slice(0, 50)
  if (!ids.length) return null
  const res = await call('other', `${API}/videos?part=statistics&id=${ids.join(',')}`, deps, r)
  if ('stop' in res) return res.stop
  if ('skip' in res) { deps.log?.(`videos.list ${res.skip} — 건너뜀`); return null }
  const dup = await deps.existing(ids.map((id) => `v:${id}`))
  for (const v of res.json?.items ?? []) {
    // commentCount 없음 = 댓글이 꺼진 영상 → 등록하지 않는다(어댑터 주석: 403 commentsDisabled 가 소스를 끈다).
    if (Number(v.statistics?.commentCount ?? 0) < MIN_COMMENTS) { r.skippedFewComments++; continue }
    if (dup.has(`v:${v.id}`)) { r.skippedDup++; continue }
    if (r.registered >= deps.maxNewVideos) return null
    if (await deps.register({ videoId: v.id, projectId: t.projectId, label: t.label })) r.registered++
  }
  return null
}

export async function expand(targets: ExpandTarget[], deps: ExpandDeps): Promise<ExpandResult> {
  const r: ExpandResult = { calls: { search: 0, other: 0 }, registered: 0, skippedDup: 0, skippedFewComments: 0, stopped: null, touched: [] }
  for (const t of targets) {
    if (r.registered >= deps.maxNewVideos) break
    const q = parseQueryRef(t.productRef)
    const ch = q ? null : parseChannelRef(t.productRef)
    if (!q && !ch) { deps.log?.(`키 해석 불가 건너뜀: ${t.productRef.slice(0, 40)}`); continue }
    const first = q
      ? await call('search', `${API}/search?part=id&type=video&maxResults=15&q=${encodeURIComponent(q)}`, deps, r)
      : await call('other', `${API}/playlistItems?part=contentDetails&maxResults=10&playlistId=${uploadsPlaylistId(ch as string)}`, deps, r)
    if ('stop' in first) { r.stopped = first.stop; break }
    if ('skip' in first) { deps.log?.(`${t.productRef.slice(0, 30)} ${first.skip} — 건너뜀`); continue }
    const ids: string[] = q
      ? (first.json?.items ?? []).map((x: any) => x?.id?.videoId)
      : (first.json?.items ?? []).map((x: any) => x?.contentDetails?.videoId)
    r.touched.push(t.id)
    const stop = await registerFrom(ids.filter(Boolean), t, deps, r)
    if (stop) { r.stopped = stop; break }
  }
  return r
}
