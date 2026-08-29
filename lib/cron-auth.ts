// 크론·수동 트리거 라우트의 공통 인증.
//
// ⚠️ 이 파일이 생긴 이유(2026-08-29 실측):
//
//   기존 라우트들은 전부 이렇게 인증했다:
//
//     if (auth !== `Bearer ${process.env.CRON_SECRET}`) return 401
//
//   CRON_SECRET 이 설정돼 있지 않으면 템플릿 리터럴이 문자열 "Bearer undefined"
//   로 평가된다. 즉 **환경변수가 비면 인증이 사라지는 게 아니라, 비밀번호가
//   "undefined" 로 바뀐다.** 그 값을 보낸 사람은 누구나 통과한다.
//
//   preview 환경에서 실제로 통과하는 것을 확인했다:
//     curl -X POST -H "Authorization: Bearer undefined" .../api/threads/publish
//     → HTTP 200
//
//   영향받는 라우트에 /api/threads/publish 가 있다. 그건 Threads 에 실제로
//   글을 발행하고 되돌릴 수 없다.
//
//   그래서 여기서는 **변수가 없으면 무조건 거부**한다. 설정 누락이
//   인증 우회가 아니라 서비스 중단으로 나타나야 한다 — 조용히 열리는 것보다
//   시끄럽게 닫히는 편이 언제나 낫다.

import { NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'

/** 길이가 달라도 예외 없이 false 를 주는 상수시간 비교. */
function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

/**
 * 통과하면 null, 막히면 응답을 돌려준다.
 *
 *   const denied = requireCronAuth(req)
 *   if (denied) return denied
 */
export function requireCronAuth(req: Request): NextResponse | null {
  const secret = process.env.CRON_SECRET

  if (!secret || !secret.trim()) {
    // 500 이다. 401 로 두면 "비밀이 틀렸나" 하고 값을 뒤지게 되는데
    // 실제 문제는 서버 설정이다. 원인을 응답에 적어 추적을 짧게 만든다.
    return NextResponse.json(
      {
        error: 'Server misconfigured',
        message:
          'CRON_SECRET 환경변수가 설정되지 않았다. 설정 전까지 이 라우트는 모든 요청을 거부한다.',
      },
      { status: 500 },
    )
  }

  const header = req.headers.get('authorization') ?? ''
  if (!safeEqual(header, `Bearer ${secret}`)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return null
}
