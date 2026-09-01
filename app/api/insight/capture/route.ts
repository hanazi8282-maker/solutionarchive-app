// 저장 계층 — 인사이트 있는 Threads 글을 saved_examples 에 넣는다.
//
// ⚠️ 왜 Notion 이 아니라 이 엔드포인트가 정본인가:
//
//   설계안 §1 은 Notion 인박스 DB 를 캡처 계층으로 삼는다. 그 경로도 지원하지만
//   (lib/insight/notion.ts, 환경변수가 있을 때만 동작) 파이프라인이 Notion 에
//   의존하게 두지는 않았다. 이유:
//
//     - Notion 연동은 통합 토큰 발급 + DB 공유 설정 + 속성 이름 일치가 전부
//       맞아야 동작한다. 셋 중 하나만 어긋나도 조용히 0건 동기화된다.
//     - 속성 이름이 한글이라 Notion 에서 이름만 바꿔도 동기화가 끊긴다.
//       그 고장은 에러가 아니라 "오늘은 저장한 게 없나 보다"로 보인다.
//
//   반면 이 엔드포인트는 의존성이 없다. 아이폰 단축어(공유 시트 → 탭 한 번)나
//   curl 로 바로 넣을 수 있고, 마찰이 Notion 앱을 여는 것보다 오히려 낮다.
//   Notion 을 계속 쓰고 싶으면 그쪽도 그대로 돌아간다 — 둘 다 같은 테이블에
//   멱등하게 들어간다.
//
// 사용 예 (아이폰 단축어 / curl):
//
//   curl -X POST https://<host>/api/insight/capture \
//     -H "Authorization: Bearer $CRON_SECRET" \
//     -H "Content-Type: application/json" \
//     -d '{"url":"https://www.threads.net/@x/post/abc","text":"원문 전체","note":"훅이 좋았다"}'
//
// 원문(text)은 가능하면 넣는다. URL 만 넣어도 저장은 되지만, Threads 공개
// 스크레이핑이 불안정해 분석 단계에서 원문을 못 구하면 그 행은 failed 로 남는다.

import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { createClient } from '@/lib/supabase/server'
import { saveExample, type CaptureInput } from '@/lib/insight/capture'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 저장 본체와 멱등성 키는 lib/insight/capture.ts 로 옮겼다.
// 캡처 경로가 둘(이 라우트 + 카카오 웹훅)이 되면서, 로직이 갈리면 같은 글이
// 경로에 따라 다른 행이 된다. 그러면 evidence_count 가 부풀어 "2건 이상
// 반복 관찰"이라는 반영 기준이 거짓으로 충족된다.

export async function POST(req: Request) {
  const denied = requireCronAuth(req)
  if (denied) return denied

  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ ok: false, message: 'Supabase 환경변수 없음' }, { status: 500 })
  }

  let body: CaptureInput
  try {
    body = (await req.json()) as CaptureInput
  } catch {
    return NextResponse.json({ ok: false, message: 'JSON 파싱 실패' }, { status: 400 })
  }

  // 이미 있으면 새 행을 만들지 않는다. 나중에 원문을 채워 다시 보내는 경우를
  // 위해 ignoreDuplicates 는 끄되, 분석 결과 컬럼은 건드리지 않는다
  // (upsert payload 에 아예 없으므로 기존 분석이 지워지지 않는다).
  const store = {
    async upsertSavedExample(row: Record<string, unknown>) {
      const { data, error } = await supabase
        .from('saved_examples')
        .upsert(row, { onConflict: 'notion_page_id', ignoreDuplicates: false })
        .select('id, notion_page_id, analysis_status')
        .single()
      return { data: data ?? null, error: error ? { message: error.message } : null }
    },
  }

  const result = await saveExample(body, store)
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, message: result.message, detail: result.detail },
      { status: result.failure === 'no-key' ? 400 : 500 },
    )
  }

  return NextResponse.json({ ok: true, saved: result.saved, message: result.message })
}
