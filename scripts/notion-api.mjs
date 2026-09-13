// Notion REST 호출 한 벌. notion-push-digest / notion-pull-feedback / notion-status-log 가
// 같이 쓴다. 의존성 0 — supabase 등을 끌어오지 않아야 npm ci 없는 워크플로에서도 import 된다.
//
// 반환: { ok: true, data } | { ok: false, status, error }
//   status 는 HTTP 코드(네트워크 실패면 undefined). error 문자열 형식은 옮기기 전과 같다.

export const NOTION_VERSION = '2022-06-28'
const NOTION_API = 'https://api.notion.com/v1'

export async function notionRequest(token, method, endpoint, body) {
  let res
  try {
    res = await fetch(`${NOTION_API}${endpoint}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch (e) {
    return { ok: false, error: `네트워크 실패 — ${e.message}` }
  }
  const json = await res.json().catch(() => null)
  if (!res.ok) return { ok: false, status: res.status, error: `${res.status} ${json?.code ?? ''} ${json?.message ?? ''}`.trim() }
  return { ok: true, data: json }
}
