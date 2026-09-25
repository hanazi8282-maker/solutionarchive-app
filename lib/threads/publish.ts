// Threads 텍스트 게시 한 벌 — 컨테이너 생성 → 처리 대기 → 발행 → 퍼머링크 조회.
//
// ⛔ 이 모듈을 부르는 곳은 app/dashboard/actions.ts publishNow (로그인한 사람이 버튼을 누른 서버 액션) 하나다.
//    크론·스크립트·서브에이전트에서 import 하지 않는다 — CLAUDE.md §10 "무인 자동 발행 금지". 토큰은 Vercel 런타임에만 있다.
//
// Meta 문서(developers.facebook.com/docs/threads/posts): POST /{user}/threads(media_type=TEXT) → creation_id,
// 서버 처리 뒤 POST /{user}/threads_publish(creation_id). 텍스트 상한 500자, 24시간 250건.
// fetch·sleep 을 주입받아 selftest 가 네트워크 없이 시나리오를 돈다.

const API = 'https://graph.threads.net/v1.0'
export const THREADS_TEXT_MAX = 500

export type ThreadsCreds = { accessToken: string; userId: string }
export type PublishResult =
  | { ok: true; id: string; permalink: string | null; timestamp: string | null; creationId: string }
  | { ok: false; stage: 'validate' | 'container' | 'status' | 'publish' | 'fetch'; reason: string; creationId?: string }

type FetchLike = (url: string, init?: { method?: string; body?: URLSearchParams }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>

const asObj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {})
const errText = (j: Record<string, unknown>) => {
  const e = asObj(j.error)
  return String(e.message ?? j.error_message ?? JSON.stringify(j)).slice(0, 300)
}

export async function publishTextPost(
  creds: ThreadsCreds,
  text: string,
  { fetchImpl = fetch as unknown as FetchLike, sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)), pollMs = 3000, maxPolls = 10 } = {},
): Promise<PublishResult> {
  const body = (text ?? '').replace(/\r/g, '').trim()
  if (!body) return { ok: false, stage: 'validate', reason: '본문이 비어 있다' }
  if ([...body].length > THREADS_TEXT_MAX) return { ok: false, stage: 'validate', reason: `본문 ${[...body].length}자 — Threads 상한 ${THREADS_TEXT_MAX}자 초과` }

  // 1) 컨테이너
  const c = await fetchImpl(`${API}/${creds.userId}/threads`, {
    method: 'POST',
    body: new URLSearchParams({ media_type: 'TEXT', text: body, access_token: creds.accessToken }),
  })
  const cj = asObj(await c.json().catch(() => ({})))
  if (!c.ok || typeof cj.id !== 'string') return { ok: false, stage: 'container', reason: `컨테이너 생성 실패 HTTP ${c.status}: ${errText(cj)}` }
  const creationId = cj.id

  // 2) 처리 대기 — FINISHED 가 될 때까지. 텍스트는 보통 즉시 끝나지만 문서가 대기를 권한다.
  for (let i = 0; i < maxPolls; i++) {
    const s = await fetchImpl(`${API}/${creationId}?fields=status,error_message&access_token=${encodeURIComponent(creds.accessToken)}`)
    const sj = asObj(await s.json().catch(() => ({})))
    const status = String(sj.status ?? '')
    if (status === 'FINISHED') break
    if (status === 'ERROR' || status === 'EXPIRED') return { ok: false, stage: 'status', reason: `컨테이너 ${status}: ${errText(sj)}`, creationId }
    if (i === maxPolls - 1) return { ok: false, stage: 'status', reason: `컨테이너가 ${maxPolls}회 확인 뒤에도 FINISHED 가 아니다(${status || '상태 없음'}) — 발행하지 않았다`, creationId }
    await sleep(pollMs)
  }

  // 3) 발행
  const p = await fetchImpl(`${API}/${creds.userId}/threads_publish`, {
    method: 'POST',
    body: new URLSearchParams({ creation_id: creationId, access_token: creds.accessToken }),
  })
  const pj = asObj(await p.json().catch(() => ({})))
  if (!p.ok || typeof pj.id !== 'string') return { ok: false, stage: 'publish', reason: `발행 실패 HTTP ${p.status}: ${errText(pj)}`, creationId }
  const id = pj.id

  // 4) 퍼머링크·시각 — 실패해도 발행은 됐다. 매처 필드 세트(external_id·published_at·permalink)를 채우려는 것뿐이라 null 로 둔다.
  const f = await fetchImpl(`${API}/${id}?fields=permalink,timestamp&access_token=${encodeURIComponent(creds.accessToken)}`)
  const fj = asObj(await f.json().catch(() => ({})))
  return {
    ok: true,
    id,
    creationId,
    permalink: typeof fj.permalink === 'string' ? fj.permalink : null,
    timestamp: typeof fj.timestamp === 'string' ? fj.timestamp : null,
  }
}
