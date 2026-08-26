// 토큰 갱신 전용 크론 엔드포인트.
//
// 실제 갱신 판단·수행은 ensureValidToken() 안에 있다. 이 라우트는 그걸 주기적으로
// 깨우는 역할만 한다 — 발행이 며칠 멈춰 있어도 토큰은 계속 살아 있어야 하기 때문이다.
// Threads 장기 토큰은 60일이 지나면 갱신 자체가 불가능해져 수동 재인증밖에 답이 없다.

import { NextResponse } from 'next/server'
import { ensureValidToken } from '@/lib/threads/token'

export async function GET(req: Request) { return POST(req) }

export async function POST(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const creds = await ensureValidToken()

  // 토큰이 없거나 만료돼 갱신 불가한 상태다. 사람이 재인증해야 하므로
  // 200 + needsReauth 로 알린다(크론 실패 알람 대신 응답 본문으로 드러낸다).
  if (!creds) {
    return NextResponse.json({ ok: false, needsReauth: true, message: 'Threads 재인증 필요' })
  }

  return NextResponse.json({ ok: true, userId: creds.userId })
}
