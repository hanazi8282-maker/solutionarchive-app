// POST /d/<token>/event — 열람·읽은 깊이 기록(sendBeacon 은 text/plain 으로 보낸다). 토큰을 아는 사람만, 숫자 두 칸만 바뀐다.
import { NextResponse, type NextRequest } from 'next/server'
import { recordEvent, TOKEN_RE } from '@/lib/consult/leads'

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params
  if (!TOKEN_RE.test(token)) return new NextResponse(null, { status: 404 })
  let b: { type?: string; depth?: number } = {}
  try { b = JSON.parse((await req.text()).slice(0, 200)) } catch { return new NextResponse(null, { status: 400 }) }
  if (b.type !== 'view' && b.type !== 'depth') return new NextResponse(null, { status: 400 })
  await recordEvent(token, { type: b.type, depth: Number(b.depth) })
  return new NextResponse(null, { status: 204 })
}
