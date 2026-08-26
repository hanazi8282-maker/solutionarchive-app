// Threads 장기 토큰 최초 1건을 api_tokens 에 수동 삽입한다.
//
// 콜백 라우트(app/api/threads/callback)가 완성되기 전까지만 쓰는 부트스트랩용.
// 콜백이 붙으면 이 스크립트는 필요 없어진다.
//
// 검증만:  node --env-file=.env.local scripts/threads-token-seed.mjs --check
// 삽입까지: node --env-file=.env.local scripts/threads-token-seed.mjs
//
// 토큰 값은 stdout 에 절대 출력하지 않는다(길이와 앞 6자만 찍는다).
// 셸 히스토리와 대시보드 쿼리 기록에 토큰이 남지 않도록, 값은 .env.local 에서만 읽는다.
//
// 종료는 process.exit() 이 아니라 main() 의 반환값을 process.exitCode 에 넣는 방식이다.
// Windows 에서 fetch(undici) 소켓이 열린 채 process.exit() 을 부르면 libuv 가
// assertion(!(handle->flags & UV_HANDLE_CLOSING))으로 죽어 exit 127 이 되고,
// 정상 출력까지 다 찍힌 뒤 실패처럼 보인다. 반환값 방식은 핸들이 정리된 뒤 종료한다.

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000

async function main() {
  const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  const TOKEN = process.env.THREADS_ACCESS_TOKEN

  const checkOnly = process.argv.includes('--check')

  if (!TOKEN) {
    console.error('THREADS_ACCESS_TOKEN 이 필요합니다. .env.local 에 넣고 다시 실행하세요.')
    return 1
  }
  if (!checkOnly && (!URL_BASE || !KEY)) {
    console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 가 필요합니다.')
    return 1
  }

  // Threads 장기 토큰은 60일. 이 토큰을 방금 발급받았다는 전제로 만료를 계산한다.
  // 발급이 며칠 전이었다면 expires_at 이 실제보다 늦게 잡히는데, 그러면 갱신 크론이
  // "아직 여유 있음"으로 판단해 갱신을 미루다 만료를 놓칠 수 있다.
  // 발급일이 오늘이 아니면 THREADS_TOKEN_ISSUED_AT=2026-08-20 형태로 넘겨 보정하라.
  const issuedAt = process.env.THREADS_TOKEN_ISSUED_AT
    ? new Date(process.env.THREADS_TOKEN_ISSUED_AT)
    : new Date()

  if (Number.isNaN(issuedAt.getTime())) {
    console.error(`THREADS_TOKEN_ISSUED_AT 을 날짜로 해석할 수 없습니다: ${process.env.THREADS_TOKEN_ISSUED_AT}`)
    return 1
  }

  const expiresAt = new Date(issuedAt.getTime() + SIXTY_DAYS_MS)

  // ── 1) 토큰 유효성 확인 + user_id 조회 ───────────────────────
  // access_token 을 쿼리스트링에 넣으면 서버 접근로그에 남으므로 Authorization 헤더를 쓴다.
  const meRes = await fetch(
    'https://graph.threads.net/v1.0/me?fields=id,username',
    { headers: { Authorization: `Bearer ${TOKEN}` } },
  )
  const me = await meRes.json()

  if (!meRes.ok || !me.id) {
    console.error(`토큰 검증 실패 (HTTP ${meRes.status}):`, JSON.stringify(me))
    return 1
  }

  console.log('토큰 유효함')
  console.log(`  user_id  : ${me.id}`)
  console.log(`  username : ${me.username ?? '(없음)'}`)
  console.log(`  토큰     : ${TOKEN.slice(0, 6)}… (${TOKEN.length}자)`)
  console.log(`  발급일   : ${issuedAt.toISOString()}${process.env.THREADS_TOKEN_ISSUED_AT ? '' : ' (오늘로 가정)'}`)
  console.log(`  만료예정 : ${expiresAt.toISOString()}`)

  if (checkOnly) {
    console.log('\n--check 모드: DB 에 쓰지 않고 종료합니다.')
    return 0
  }

  // ── 2) api_tokens 에 upsert ──────────────────────────────────
  // refresh_token 은 넣지 않는다. Threads 는 access_token 자체로 갱신하므로
  // 이 컬럼에 값을 복사해두면 갱신 때 한쪽만 바뀌어 어긋난다(마이그레이션 주석 참조).
  const row = {
    provider: 'threads',
    access_token: TOKEN,
    refresh_token: null,
    expires_at: expiresAt.toISOString(),
    user_id: me.id,
    scope: process.env.THREADS_TOKEN_SCOPE ?? null,
    updated_at: new Date().toISOString(),
  }

  const res = await fetch(`${URL_BASE}/rest/v1/api_tokens?on_conflict=provider`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(row),
  })

  const body = await res.text()

  if (!res.ok) {
    console.error(`\nupsert 실패 (HTTP ${res.status}): ${body}`)
    if (res.status === 404) {
      console.error('테이블이 없습니다 — 20260826000001_api_tokens.sql 을 먼저 실행하세요.')
    }
    return 1
  }

  // 응답에 access_token 이 그대로 들어 있으므로 통째로 찍지 않는다.
  const saved = JSON.parse(body)[0] ?? {}
  console.log('\napi_tokens upsert 완료')
  console.log(`  provider   : ${saved.provider}`)
  console.log(`  user_id    : ${saved.user_id}`)
  console.log(`  expires_at : ${saved.expires_at}`)
  return 0
}

process.exitCode = await main()
