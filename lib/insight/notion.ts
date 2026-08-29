// Notion 인박스 → saved_examples 동기화 (선택 경로).
//
// ⚠️ 이 어댑터는 **미검증이다.** 작성 시점에 Notion DB 의 실제 ID 와 속성
//    이름을 확인할 수 없었다(워크스페이스 검색에 해당 DB 가 잡히지 않았다).
//    그래서 두 가지 방어를 뒀다:
//
//    1. 환경변수가 없으면 조용히 skip 한다. 나이틀리 루프의 나머지 단계는
//       그대로 돈다 — Notion 이 이 파이프라인의 단일 실패점이 되면 안 된다.
//    2. 속성 이름을 환경변수로 바꿀 수 있게 했고, 못 찾은 속성 이름을
//       결과에 담아 돌려준다. "0건 동기화"가 "저장한 게 없어서"인지
//       "속성 이름이 안 맞아서"인지 구별되지 않으면 며칠을 날린다.
//
// 정본 캡처 경로는 /api/insight/capture 다. 이건 보조다.
//
// 필요한 환경변수:
//   NOTION_API_KEY        — 내부 통합 토큰(해당 DB 를 통합에 공유해야 한다)
//   NOTION_INSIGHT_DB_ID  — 인박스 데이터베이스 ID
// 선택:
//   NOTION_PROP_URL / NOTION_PROP_TEXT / NOTION_PROP_NOTE / NOTION_PROP_STATUS

const NOTION_API = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'

export interface NotionConfig {
  token: string
  databaseId: string
  propUrl: string
  propText: string
  propNote: string
  propStatus: string
}

export function notionConfig(): NotionConfig | null {
  const token = process.env.NOTION_API_KEY
  const databaseId = process.env.NOTION_INSIGHT_DB_ID
  if (!token || !databaseId) return null

  return {
    token,
    databaseId,
    propUrl: process.env.NOTION_PROP_URL ?? 'URL',
    propText: process.env.NOTION_PROP_TEXT ?? '원문 텍스트',
    propNote: process.env.NOTION_PROP_NOTE ?? '왜 좋았는지',
    propStatus: process.env.NOTION_PROP_STATUS ?? '동기화 상태',
  }
}

function headers(cfg: NotionConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${cfg.token}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json',
  }
}

export interface NotionRow {
  pageId: string
  url: string | null
  text: string | null
  note: string | null
  createdTime: string
}

export interface NotionFetchResult {
  rows: NotionRow[]
  /** 페이지에는 있었지만 설정된 이름으로 못 찾은 속성들. 진단용. */
  missingProps: string[]
  /** 실제 DB 에 존재하는 속성 이름 전부. 이름이 어긋났을 때 바로 보이라고 담는다. */
  availableProps: string[]
}

function plainText(prop: unknown): string | null {
  if (typeof prop !== 'object' || prop === null) return null
  const p = prop as Record<string, unknown>

  const arr =
    (Array.isArray(p.rich_text) && p.rich_text) ||
    (Array.isArray(p.title) && p.title) ||
    null
  if (arr) {
    const joined = (arr as Array<Record<string, unknown>>)
      .map((t) => (typeof t.plain_text === 'string' ? t.plain_text : ''))
      .join('')
      .trim()
    return joined || null
  }

  if (typeof p.url === 'string') return p.url.trim() || null
  return null
}

/** 동기화 상태가 pending 인 행을 읽는다. */
export async function fetchPending(cfg: NotionConfig, limit = 25): Promise<NotionFetchResult> {
  const res = await fetch(`${NOTION_API}/databases/${cfg.databaseId}/query`, {
    method: 'POST',
    headers: headers(cfg),
    body: JSON.stringify({
      page_size: limit,
      filter: {
        property: cfg.propStatus,
        select: { equals: 'pending' },
      },
    }),
  })

  if (!res.ok) {
    const body = (await res.text()).slice(0, 400)
    // 속성 이름이 틀리면 Notion 은 400 을 준다. 그 사실을 그대로 올린다.
    throw new Error(`Notion 조회 실패 (${res.status}): ${body}`)
  }

  const body = (await res.json()) as { results?: Array<Record<string, unknown>> }
  const results = body.results ?? []

  const availableProps = new Set<string>()
  const missingProps = new Set<string>()
  const rows: NotionRow[] = []

  for (const page of results) {
    const props = (page.properties ?? {}) as Record<string, unknown>
    for (const k of Object.keys(props)) availableProps.add(k)

    for (const want of [cfg.propUrl, cfg.propText, cfg.propNote]) {
      if (!(want in props)) missingProps.add(want)
    }

    rows.push({
      pageId: String(page.id ?? ''),
      url: plainText(props[cfg.propUrl]),
      text: plainText(props[cfg.propText]),
      note: plainText(props[cfg.propNote]),
      createdTime: String(page.created_time ?? new Date().toISOString()),
    })
  }

  return {
    rows: rows.filter((r) => r.pageId),
    missingProps: [...missingProps],
    availableProps: [...availableProps],
  }
}

/** 동기화 완료 표시. 실패해도 던지지 않는다 — 표시 실패로 전체를 멈추지 않는다. */
export async function markSynced(cfg: NotionConfig, pageId: string): Promise<boolean> {
  try {
    const res = await fetch(`${NOTION_API}/pages/${pageId}`, {
      method: 'PATCH',
      headers: headers(cfg),
      body: JSON.stringify({
        properties: { [cfg.propStatus]: { select: { name: 'synced' } } },
      }),
    })
    return res.ok
  } catch {
    return false
  }
}
