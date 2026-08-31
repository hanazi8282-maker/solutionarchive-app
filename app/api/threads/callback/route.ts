// ⛔ 지우지 마라. 상시 유지 대상이다.
//
//    예전 주석은 "임시 파일 — 토큰 발급 완료 후 삭제할 것"이었다. 그건 최초
//    토큰을 받던 시점의 이야기이고, 지금은 틀렸다.
//
//    이 라우트는 **토큰 갱신이 끊겼을 때의 유일한 재인증 경로**다.
//    평소 갱신은 lib/threads/token.ts 의 th_refresh_token 그랜트가 처리하고
//    거기엔 client_secret 도 이 라우트도 필요 없다. 그래서 몇 달이고 이 파일이
//    한 번도 안 불린다 — 안 쓰이는 것처럼 보인다는 게 이 파일의 함정이다.
//
//    갱신은 끊긴다. 토큰 수명이 60일인데 그 안에 갱신이 한 번도 못 돌면
//    (크론 정지, 배포 사고, Meta 측 오류) 토큰은 만료되고 th_refresh_token 은
//    만료된 토큰을 되살리지 못한다. 그때 복구 수단은 인가를 처음부터 다시
//    받는 것뿐이고, 그게 이 라우트다. 지워 두면 하필 급한 순간에 다시 만들어야
//    한다.
//
//    운영 조건(2026-08-31 확인):
//      - 콜백 URL 은 https://solutionarch.vercel.app/api/threads/callback 하나.
//        Meta 앱 대시보드 등록값과 문자 단위로 같아야 한다. 도메인을 바꾸려면
//        Meta 콘솔 등록값을 **먼저** 바꿔야 한다.
//      - THREADS_APP_ID / THREADS_APP_SECRET 은 이 파일에서만 쓴다.
//        solutionarch 프로덕션에 등록돼 있다. 다른 Vercel 프로젝트에는 없다.
//
// 인가 흐름(공식 문서 기준):
//   1. 브라우저를 https://threads.net/oauth/authorize 로 보낸다
//      (client_id / redirect_uri / response_type=code / scope / state)
//   2. 사용자가 승인하면 이 콜백으로 ?code=... 가 돌아온다 (code 수명 약 10분)
//   3. code → 단기 토큰(1시간)  : POST /oauth/access_token
//   4. 단기 → 장기 토큰(60일)   : GET  /access_token?grant_type=th_exchange_token
//   5. api_tokens 에 저장
//
// cafe24 콜백과 달리 교환이 2단계다. Threads 는 code 교환 응답에
// expires_in 을 주지 않고(access_token 과 user_id 뿐), 만료 시각은
// 4단계 응답에서만 알 수 있기 때문에 단기 토큰은 저장하지 않고 흘려보낸다.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const BASE = 'https://graph.threads.net'
const PROVIDER = 'threads'

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams

  const oauthError = params.get('error')
  if (oauthError) {
    const reason = params.get('error_description') ?? params.get('error_reason') ?? oauthError
    return NextResponse.json({ error: `Threads 인증 실패: ${reason}` }, { status: 400 })
  }

  const rawCode = params.get('code')
  if (!rawCode) {
    return NextResponse.json({ error: 'code 파라미터가 없습니다.' }, { status: 400 })
  }

  // Threads 는 리디렉션 URI 끝에 '#_' 를 붙여 보낸다. code 의 일부가 아니므로
  // 잘라내지 않으면 교환이 그대로 실패한다(공식 문서가 명시적으로 경고).
  // 프래그먼트는 보통 서버까지 오지 않지만, 인코딩되어 쿼리에 섞여 들어오는 경우가 있어
  // 방어적으로 제거한다.
  const code = rawCode.replace(/#_$/, '')

  const clientId = process.env.THREADS_APP_ID
  const clientSecret = process.env.THREADS_APP_SECRET

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'THREADS_APP_ID / THREADS_APP_SECRET 환경변수가 누락되었습니다.' },
      { status: 500 },
    )
  }

  // redirect_uri 는 인가 요청 때 보낸 값과 문자 단위로 같아야 한다.
  // Meta 앱 대시보드에 등록된 값과도 정확히 일치해야 하며, 대시보드가 끝에
  // 슬래시를 자동으로 붙이는 경우가 있으니 등록값을 눈으로 확인할 것.
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://solutionarch.vercel.app'
  const redirectUri = `${baseUrl}/api/threads/callback`

  // ── 3) code → 단기 토큰 ──────────────────────────────────────
  const shortRes = await fetch(`${BASE}/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
      code,
    }).toString(),
  })

  const shortJson = await shortRes.json().catch(() => ({}))

  if (!shortRes.ok || !shortJson.access_token) {
    console.error(`[threads] code 교환 실패: ${shortRes.status}`)
    return NextResponse.json(
      { error: `단기 토큰 교환 실패 (${shortRes.status})`, detail: shortJson },
      { status: 502 },
    )
  }

  const userId: string | undefined = shortJson.user_id ? String(shortJson.user_id) : undefined

  // ── 4) 단기 → 장기 토큰 ──────────────────────────────────────
  const longUrl = new URL(`${BASE}/access_token`)
  longUrl.searchParams.set('grant_type', 'th_exchange_token')
  longUrl.searchParams.set('client_secret', clientSecret)
  longUrl.searchParams.set('access_token', shortJson.access_token as string)

  const longRes = await fetch(longUrl, { method: 'GET' })
  const longJson = await longRes.json().catch(() => ({}))

  if (!longRes.ok || !longJson.access_token) {
    console.error(`[threads] 장기 토큰 교환 실패: ${longRes.status}`)
    return NextResponse.json(
      { error: `장기 토큰 교환 실패 (${longRes.status})`, detail: longJson },
      { status: 502 },
    )
  }

  const expiresIn: number =
    typeof longJson.expires_in === 'number' ? longJson.expires_in : 60 * 24 * 60 * 60
  const expiresAt = new Date(Date.now() + expiresIn * 1000)

  // ── 5) api_tokens 저장 ───────────────────────────────────────
  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ error: 'DB 연결 실패 — 토큰을 저장하지 못했습니다.' }, { status: 500 })
  }

  const { error: upsertErr } = await supabase.from('api_tokens').upsert(
    {
      provider: PROVIDER,
      access_token: longJson.access_token as string,
      // Threads 는 별도 refresh_token 이 없다(access_token 자체로 갱신). null 로 둔다.
      refresh_token: null,
      expires_at: expiresAt.toISOString(),
      user_id: userId ?? null,
      scope: params.get('granted_scopes'),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'provider' },
  )

  if (upsertErr) {
    console.error(`[threads] 토큰 저장 실패: ${upsertErr.message}`)
    return NextResponse.json({ error: `토큰 저장 실패: ${upsertErr.message}` }, { status: 500 })
  }

  // 토큰 값은 응답에 절대 넣지 않는다 — 이 응답은 브라우저 주소창을 통해 보여지고
  // 브라우저 히스토리에도 남는다.
  return NextResponse.json({
    ok: true,
    message: 'Threads 토큰 발급·저장 완료. 이 라우트는 이제 삭제해도 됩니다.',
    userId: userId ?? null,
    expiresAt: expiresAt.toISOString(),
  })
}
