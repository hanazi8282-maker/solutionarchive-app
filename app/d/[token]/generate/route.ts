// POST /d/<token>/generate — 초안 만들기 시작(열람 화면이 한 번 부른다). 선점은 DB 한 줄 갱신이라 중복 호출은 아무것도 안 한다.
import { NextResponse, type NextRequest } from 'next/server'
import { claimGeneration, getLead, runDraft, TOKEN_RE } from '@/lib/consult/leads'

export const maxDuration = 300

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  if (!TOKEN_RE.test(token)) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  const claimed = await claimGeneration(token)
  if (!claimed) {
    const l = await getLead(token)
    return l ? NextResponse.json({ status: l.status }) : NextResponse.json({ error: 'not_found' }, { status: 404 })
  }
  await runDraft(claimed, process.env.NEXT_PUBLIC_SITE_URL ?? new URL(req.url).origin)
  const l = await getLead(token)
  return NextResponse.json({ status: l?.status ?? 'failed' })
}
