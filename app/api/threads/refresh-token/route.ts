// 토큰 갱신 전용 크론 엔드포인트.
//
// 실제 갱신 판단·수행은 loadThreadsToken() 안에 있다. 이 라우트는 그걸 주기적으로
// 깨우는 역할만 한다 — 발행이 며칠 멈춰 있어도 토큰은 계속 살아 있어야 하기 때문이다.
// Threads 장기 토큰은 60일이 지나면 갱신 자체가 불가능해져 수동 재인증밖에 답이 없다.
//
// 응답 규약은 refreshCronResponse — 만료·갱신 실패를 200 으로 돌려주지 않는다(진단 3-1).
// Vercel 크론 로그는 사람이 안 보므로, 매일 아침 scripts/cron-watchdog.mjs 가 api_tokens 만료를
// 따로 읽어 Notion 일일 상태 로그 막힌것 칸에 올린다.

import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { loadThreadsToken, refreshCronResponse } from '@/lib/threads/token'

export async function GET(req: Request) { return POST(req) }

export async function POST(req: Request) {
  const denied = requireCronAuth(req)
  if (denied) return denied

  const r = refreshCronResponse(await loadThreadsToken())
  return NextResponse.json(r.body, { status: r.status })
}
