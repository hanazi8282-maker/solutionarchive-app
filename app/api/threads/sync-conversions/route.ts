// ⚠️ 크론에서 의도적으로 제외됨 — 되돌리기 전에 읽을 것.
//
// 이 라우트가 읽는 sales_fact / thread_posts / conversions 테이블이 이 프로젝트의
// Supabase 에 아직 없다. 크론에 걸어두면 매일 no-op 을 돌면서 성공처럼 보인다
// (아래 쿼리가 error 를 삼켜 ok:true, matched:0 을 반환하기 때문 — 실측 확인함).
// 테이블 마이그레이션이 끝나면 vercel.json 에 다시 추가한다: "30 9 * * *" (18:30 KST).
//
// vercel.json 은 순수 JSON 이라 주석을 못 넣는다(주석·미지원 키 모두 배포를 깨뜨림).
// 그래서 이 설명이 라우트 파일에 있다.

import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: Request) { return POST(req) }

export async function POST(req: Request) {
  const denied = requireCronAuth(req)
  if (denied) return denied

  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 })

  // sales_fact 테이블에서 최근 7일 솔루션아카이브 주문 가져오기
  // (이미 Cafe24 어댑터가 수집해놓은 데이터 활용)
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  // TODO(테이블 마이그레이션 때 같이 고칠 것): error 를 구조분해하지 않아 삼키고 있다.
  //   sales_fact 가 없으면 PostgREST 가 PGRST205 를 주는데, orders 는 null 이 되고
  //   아래 `if (!orders?.length)` 가 이를 "주문 없음"으로 오인해 ok:true 를 반환한다.
  //   테이블 부재·권한 오류가 정상 응답으로 위장되므로, error 를 받아 500 으로 올릴 것.
  const { data: orders } = await supabase
    .from('sales_fact')
    .select('order_id, ordered_at, revenue, quantity, channel, raw')
    .eq('channel', 'cafe24')                // 브랜드 필터는 raw 또는 channel로
    .gte('ordered_at', since)

  if (!orders?.length) return NextResponse.json({ ok: true, matched: 0 })

  let matched = 0
  for (const order of orders) {
    // raw 컬럼에 저장된 Cafe24 주문 데이터에서 utm_campaign 추출
    // Cafe24는 방문경로를 order_referrer 또는 custom_referrer에 저장
    const raw = order.raw as Record<string, unknown>
    const utmCampaign: string =
      (raw?.member_additional_info as Record<string,string>)?.utm_campaign
      ?? (raw?.order_referrer as string)
      ?? ''

    if (!utmCampaign || !utmCampaign.startsWith('tp_')) continue

    // thread_posts에서 해당 slug 찾기
    const { data: post } = await supabase
      .from('thread_posts')
      .select('id')
      .eq('post_slug', utmCampaign)
      .single()

    if (!post?.id) continue

    // upsert (cafe24_order_id unique로 중복 방지)
    await supabase.from('conversions').upsert({
      post_id: post.id,
      cafe24_order_id: order.order_id,
      ordered_at: order.ordered_at,
      amount: order.revenue ?? 0,
      qty: order.quantity ?? 0,
      utm_campaign: utmCampaign,
    }, { onConflict: 'cafe24_order_id' })

    matched++
  }

  return NextResponse.json({ ok: true, matched, total: orders.length })
}

// ⚠️ 참고: Cafe24가 주문에 UTM을 보존하지 않으면 쿠키 기반으로 전환 필요.
// 그 경우 /go/[slug] 에서 first-party 쿠키(tp_slug=slug, 30일)를 심고,
// 솔루션아카이브 구매 완료 페이지에서 쿠키를 읽어 /api/threads/track-purchase 에 POST.
