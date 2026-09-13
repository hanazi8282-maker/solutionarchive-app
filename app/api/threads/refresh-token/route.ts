// 토큰 갱신 전용 크론 엔드포인트.
//
// 실제 갱신 판단·수행은 ensureValidToken() 안에 있다. 이 라우트는 그걸 주기적으로
// 깨우는 역할만 한다 — 발행이 며칠 멈춰 있어도 토큰은 계속 살아 있어야 하기 때문이다.
// Threads 장기 토큰은 60일이 지나면 갱신 자체가 불가능해져 수동 재인증밖에 답이 없다.

import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { loadThreadsToken, tokenFailure } from '@/lib/threads/token'

export async function GET(req: Request) { return POST(req) }

export async function POST(req: Request) {
  const denied = requireCronAuth(req)
  if (denied) return denied

  const token = await loadThreadsToken()

  // 토큰이 없거나 만료돼 갱신 불가 → 200 + needsReauth(크론 실패 알람 대신 응답 본문으로 드러낸다).
  // api_tokens 조회 자체를 못 했으면 재인증 판단이 아니다 → 503 (tokenFailure).
  if (token.status !== 'ok') {
    const f = tokenFailure(token)
    return NextResponse.json(f.body, { status: f.status })
  }

  return NextResponse.json({ ok: true, userId: token.creds.userId })
}
