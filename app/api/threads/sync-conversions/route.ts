import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: Request) { return POST(req) }

export async function POST(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 })

  // sales_fact 테이블에서 최근 7일 솔루션아카이브 주문 가져오기
  // (이미 Cafe24 어댑터가 수집해놓은 데이터 활용)
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
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
