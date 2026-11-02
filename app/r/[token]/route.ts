// 비공개 결론서 `/r/{token}` — 로그인 없이 열리는 링크(lib/auth/policy.ts PUBLIC_PREFIXES '/r').
//
// 페이지(page.tsx)가 아니라 라우트 핸들러인 이유: 루트 layout(상단 nav·세션 조회)을 타지 않고,
// 200·404 모두 헤더(noindex·no-referrer·no-store·CSP)를 한 곳에서 똑같이 붙이기 위해서다.
//
// 열거 방지: 없음·회수·형식 오류가 같은 404 본문·헤더이고, 형식 오류도 자리표시 토큰으로 같은 쿼리 1회를 돈다.
// 열람 기록은 응답 뒤(after)에 token·kind 만 쓴다 — 응답 시간에 끼지 않는다. "열람 추정"(A등급 아닌 추정치).

import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  DUMMY_TOKEN, NOT_FOUND_HTML, TOKEN_RE, UNAVAILABLE_HTML, classifyView, renderReportPage, responseHeaders, viewRow,
} from '@/lib/report-pages/core'

export const dynamic = 'force-dynamic'

const send = (body: string, status: number) => new Response(body, { status, headers: responseHeaders() })

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params
  const valid = TOKEN_RE.test(raw)
  const token = valid ? raw : DUMMY_TOKEN

  const sb = await createClient()
  if (!sb) {
    console.error('[report-pages] supabase env missing')
    return send(UNAVAILABLE_HTML, 503)
  }
  const { data, error } = await sb
    .from('report_pages').select('html').eq('token', token).is('revoked_at', null).maybeSingle()
  if (error) {
    // 토큰은 로그에 남기지 않는다.
    console.error(`[report-pages] lookup failed: ${error.code ?? ''} ${error.message}`)
    return send(UNAVAILABLE_HTML, 503)
  }
  if (!valid || !data) return send(NOT_FOUND_HTML, 404)

  const kind = classifyView(req.headers.get('user-agent'), req.method,
    req.headers.get('sec-purpose') ?? req.headers.get('purpose'))
  after(async () => {
    const { error: e } = await sb.from('report_views').insert(viewRow(token, kind))
    if (e) console.error(`[report-pages] view log failed: ${e.code ?? ''} ${e.message}`)
  })
  return send(renderReportPage(data.html as string), 200)
}

// HEAD 는 링크 검사기가 주로 쓴다 — 같은 판정·같은 헤더, 본문 없음, 기록은 kind=bot(classifyView).
export async function HEAD(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const res = await GET(new Request(req.url, { method: 'HEAD', headers: req.headers }), ctx)
  return new Response(null, { status: res.status, headers: res.headers })
}
