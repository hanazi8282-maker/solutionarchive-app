// Supabase Edge Function 진입점 — 카카오 스킬 서버 주소를 이쪽으로 옮긴다.
//
// 배포 주소:
//   https://qmgrfqjfxqhxuufrnkwf.supabase.co/functions/v1/kakao-webhook
//
// ⚠️ `verify_jwt = false` 다 (supabase/config.toml).
//   Edge Function 은 기본적으로 `Authorization: Bearer <anon key>` 를
//   요구하는데 **카카오는 그 헤더를 보내지 않는다.** 켜 두면 카카오가
//   401 만 받고, 그건 지금 고치려는 증상과 구분이 안 된다.
//
//   그래서 이 함수는 공개 엔드포인트다. **그런데 권한이 늘지는 않는다** —
//   실제 저장 게이트인 `KAKAO_ALLOWED_USER_IDS` 허용목록은 상위 Vercel
//   라우트에 그대로 있고, 이 함수는 본문을 바꾸지 않고 넘기기만 한다.
//   즉 여기로 아무나 요청을 보내도 상위에서 "등록되지 않은 발신자"로
//   막힌다. fail-closed 경계는 한 곳에 그대로 있다.
//
// 환경변수(선택): KAKAO_UPSTREAM_URL — 비우면 프로덕션 라우트를 쓴다.
//   테스트 대상을 프리뷰로 돌릴 때만 쓴다. ⚠️ 프리뷰 URL 은 Vercel SSO
//   (`all_except_custom_domains`)에 막히므로 실제로는 프로덕션만 통한다.

import { createHandler } from './handler.ts'

const DEFAULT_UPSTREAM =
  'https://solutionarch.vercel.app/api/insight/kakao-webhook'

const upstreamUrl = Deno.env.get('KAKAO_UPSTREAM_URL')?.trim() || DEFAULT_UPSTREAM

console.log(`[kakao-proxy] 기동 — 업스트림 ${upstreamUrl}`)

Deno.serve(createHandler({ upstreamUrl }))
