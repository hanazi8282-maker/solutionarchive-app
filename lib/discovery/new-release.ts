// ① 새 출시 병렬 입력(v71au) — Product Hunt 최근 출시 → 홈페이지의 스토어 앵커. 순수 함수만(네트워크는 scripts/new-release-candidates.mjs).
// 이름→앱 ID 검색을 거치지 않는다: 공식 앱이면 홈페이지가 <meta name="apple-itunes-app" content="app-id=…"> 나 스토어 배지 링크로 ID 를 직접 알려 준다.

export type PhLaunch = { name: string; tagline: string; website: string | null; topics: string[]; votes: number; createdAt: string }

/** Product Hunt GraphQL posts 응답 → 출시 목록. edges 가 배열이 아니면 던진다(빈 목록과 못 읽은 것을 가른다 — §7.1). */
export function parsePhPosts(json: unknown): PhLaunch[] {
  const edges = (json as { data?: { posts?: { edges?: unknown } } })?.data?.posts?.edges
  if (!Array.isArray(edges)) throw new Error('posts.edges 없음')
  return edges.flatMap((e: any) => {
    const n = e?.node
    if (!n?.name) return []
    const topics = (n.topics?.edges ?? []).map((t: any) => String(t?.node?.name ?? '')).filter(Boolean)
    return [{ name: String(n.name), tagline: String(n.tagline ?? ''), website: n.website ? String(n.website) : null, topics, votes: Number(n.votesCount ?? 0), createdAt: String(n.createdAt ?? '') }]
  })
}

export type StoreAnchors = { appstore_id: string | null; play_pkg: string | null }
const META_A = /<meta[^>]+name=["']apple-itunes-app["'][^>]*content=["'][^"']*app-id=(\d+)/i
const META_B = /<meta[^>]+content=["'][^"']*app-id=(\d+)[^"']*["'][^>]*name=["']apple-itunes-app["']/i
const APPLE_LINK = /apps\.apple\.com\/[^"'\s<>]*\/id(\d{6,})/i
const PLAY_LINK = /play\.google\.com\/store\/apps\/details\?id=([A-Za-z][\w.]+)/i

/** 홈페이지 HTML → 스토어 앵커. 스마트 배너 메타가 있으면 그것을 먼저, 없으면 배지 링크. 둘 다 없으면 둘 다 null(= 공식 앱 없음 또는 확인 불가). */
export function extractStoreIds(html: string): StoreAnchors {
  const meta = META_A.exec(html) ?? META_B.exec(html)
  const link = APPLE_LINK.exec(html)
  const play = PLAY_LINK.exec(html)
  return { appstore_id: meta?.[1] ?? link?.[1] ?? null, play_pkg: play?.[1] ?? null }
}

/** 최근 days 일 안 출시만. */
export function recentLaunches(list: PhLaunch[], now: Date, days = 90): PhLaunch[] {
  const cut = now.getTime() - days * 86400_000
  return list.filter((l) => Date.parse(l.createdAt) >= cut)
}
