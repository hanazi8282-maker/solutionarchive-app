// 성과 수집 — 발행된 글의 Threads 인사이트를 나이 버킷별로 metric_snapshots 에 적재한다.
//
// ⛔ 이 라우트는 아무것도 발행하지 않는다(CLAUDE.md §10). 읽기 전용 인사이트 조회다.
//
// ⏰ 스케줄: 30 * * * * (매시 30분). match-posts 는 0 * * * * (매시 정각)다.
//
//    ⚠️ 이 30분 어긋남은 취향이 아니라 1h 버킷을 살리기 위한 장치다.
//       "왜 30분이지" 하고 정각으로 맞추면 조용히 깨진다. 고치기 전에 읽을 것.
//
//    이 라우트는 status='published' 인 행만 수집한다. 즉 매처가 먼저 돌아 초안을
//    published 로 올려두지 않으면 그 글은 수집 대상에조차 들지 않는다.
//
//    두 크론을 똑같이 0 * * * * 로 두면 Vercel 이 같은 정각의 실행 순서를
//    보장하지 않는다. 수집이 먼저 돌면 그 글은 아직 draft 라 못 본다. 그러면
//    다음 정각에는 나이가 이미 1h 창의 상한(1.9h)을 넘어서 views_1h 가 영구히
//    빈다 — 지나간 시점의 조회수는 뒤늦게 채울 방법이 없다.
//
//    views_1h 가 없으면 post_performance.spread_multiple(= views_24h / views_1h)이
//    항상 NULL 이고 H3(자답글이 확산배수를 올린다)을 아예 검증할 수 없다.
//
//    매처를 정각, 수집을 30분에 두면 "매칭 → 수집" 순서가 고정되고 수집 시점의
//    글 나이가 항상 0.5~1.5h 로 수렴해 1h 창(0.5~1.9) 한가운데에 들어온다.
//
//    vercel.json 은 순수 JSON 이라 주석을 못 넣는다. 그래서 이 설명이 여기 있다.
//
// 창 판정·manual 보호·insert/update 분기는 전부 lib/threads/buckets.ts 의 순수
// 함수에 있고 scripts/threads-collect-selftest.mjs 가 검증한다. 여기는 실행만 한다.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { fetchInsights, type ThreadsUsage } from '@/lib/threads/insights'
import { ensureValidToken } from '@/lib/threads/token'
import {
  planCollection,
  COLLECT_WINDOW_DAYS,
  BUCKETS,
  type CollectTarget,
  type ExistingSnapshot,
} from '@/lib/threads/buckets'

// 인사이트 호출 사이 간격. Threads 는 앱 단위 시간당 한도를 쓰므로 한 실행이
// 한도를 독점하지 않게 늦춘다. 창에 드는 글은 보통 한 자릿수라 총 지연은 2초 미만이다.
const CALL_SPACING_MS = 200

export async function GET(req: Request) { return POST(req) }

export async function POST(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ ok: false, message: 'Supabase 환경변수 없음' }, { status: 500 })
  }

  // 토큰은 api_tokens 가 정본이다. 만료가 가까우면 이 호출 안에서 갱신까지 끝난다.
  // 토큰이 없으면 200 으로 조용히 빠진다 — 크론이 고칠 수 없는 문제라
  // 500 으로 올리면 매시간 알람이 울리는데 정작 필요한 조치는 사람의 재인증뿐이다.
  const creds = await ensureValidToken()
  if (!creds) {
    return NextResponse.json({ ok: false, needsReauth: true, message: 'Threads 재인증 필요' })
  }

  const now = Date.now()

  // ── 1) 대상 글 ────────────────────────────────────────────────
  // 가장 늦은 창이 180h(7.5일)이므로 14일이면 넉넉하다. 그보다 오래된 글을
  // 매시간 다시 훑으면 아무것도 수집되지 않는 행만 늘어난다.
  const since = new Date(now - COLLECT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { data: postRows, error: postErr } = await supabase
    .from('posts')
    .select('id, external_id, published_at')
    .eq('status', 'published')
    .gte('published_at', since)
    .order('published_at', { ascending: false })

  if (postErr) {
    // 🔴 error 를 반드시 구조분해해서 본다.
    //    예전 코드는 `const { data } = await ...` 였다. 쿼리가 PGRST205(테이블 없음)로
    //    실패해도 data 가 null 이 되고, 그걸 "수집할 글 없음"으로 오인해 ok:true 를
    //    돌려줬다. 테이블 부재·권한 오류가 정상 응답으로 위장된다.
    console.error(`[collect] 대상 글 조회 실패: ${postErr.message}`)
    return NextResponse.json({ ok: false, message: `대상 글 조회 실패: ${postErr.message}` }, { status: 500 })
  }

  const targets = (postRows ?? []) as CollectTarget[]
  if (targets.length === 0) {
    return NextResponse.json({
      ok: true, scanned: 0, outOfWindow: 0, inserted: 0, updated: 0, skipped: [], failed: [],
      message: '14일 내 발행 글 없음 — Threads API 호출 생략',
    })
  }

  // ── 2) 기존 스냅샷(= skip 판정 근거) ──────────────────────────
  // 대상 전체를 한 번에 읽는다. 글마다 따로 물으면 왕복이 대상 수만큼 늘어난다.
  const { data: snapRows, error: snapErr } = await supabase
    .from('metric_snapshots')
    // captured_at 을 반드시 같이 읽는다. hours_since_publish 는 정규화 값(24)이라
    // "그 값이 실제로 몇 시간짜리인지"를 담지 않는다. 명목값 근접 판정이
    // captured_at - published_at 으로 그 정보를 복원한다(buckets.ts 참조).
    // 이 컬럼을 빼면 판정이 조용히 무력화되고 예전의 매시간 덮어쓰기로 돌아간다.
    .select('id, post_id, hours_since_publish, source, captured_at')
    .in('post_id', targets.map(t => t.id))
    .in('hours_since_publish', BUCKETS.map(b => b.hours))

  if (snapErr) {
    // 🔴 여기서 실패하면 무조건 중단한다. 조용히 "기존 없음"으로 진행하면
    //    (1) 이미 있는 버킷에 insert 를 때려 UNIQUE 위반이 대량 발생하고
    //    (2) source='manual' 로 사람이 채운 값을 API 값으로 덮을 수 있으며
    //    (3) 무엇보다 전량 재수집이 된다. 하루 1회일 땐 70회로 끝나던 것이
    //        매시간 스케줄에서는 하루 1,680회로 24배 증폭돼 쿼터를 태운다.
    console.error(`[collect] 기존 스냅샷 조회 실패: ${snapErr.message}`)
    return NextResponse.json({ ok: false, message: `기존 스냅샷 조회 실패: ${snapErr.message}` }, { status: 500 })
  }

  // ── 3) 계획 ───────────────────────────────────────────────────
  const plan = planCollection(targets, (snapRows ?? []) as ExistingSnapshot[], now)

  if (plan.actions.length === 0) {
    console.info(`[collect] 대상 ${targets.length} / 창 밖 ${plan.outOfWindow} / 보류 ${plan.skipped.length} — 호출 없음`)
    return NextResponse.json({
      ok: true,
      scanned: targets.length,
      outOfWindow: plan.outOfWindow,
      inserted: 0,
      updated: 0,
      skipped: plan.skipped,
      failed: [],
      message: '이번 시간에 창에 든 글 없음 — Threads API 호출 생략',
    })
  }

  // ── 4) 실행 ───────────────────────────────────────────────────
  // 박스에 담는 이유: 콜백 안에서 대입하면 TS 가 지역 let 을 never 로 좁힌다.
  const usageBox: { current: ThreadsUsage | null } = { current: null }
  const inserted: { postId: string; bucket: number }[] = []
  const updated: { postId: string; bucket: number }[] = []
  const failed: { postId: string; bucket: number; message: string }[] = []

  for (const a of plan.actions) {
    try {
      const metrics = await fetchInsights(a.mediaId, creds.accessToken, u => { usageBox.current = u })

      // profile_clicks / follows 는 넣지 않는다. Threads 에서 이 둘은 미디어가
      // 아니라 계정 단위 인사이트라 이 호출로는 얻을 수 없다. 0 으로 채우면
      // "측정했더니 0"과 "측정 안 함"이 구분되지 않으므로 null 로 둔다.
      //
      // source 도 넣지 않는다 — 컬럼 DEFAULT 가 'api' 다. 여기서 명시하면
      // 나중에 DEFAULT 를 바꿔도 이 라우트만 따라오지 않는다.
      if (a.kind === 'insert') {
        const { error } = await supabase.from('metric_snapshots').insert({
          post_id: a.postId,
          hours_since_publish: a.bucket,   // 실제 나이(a.age)가 아니라 정규화 값
          captured_at: new Date().toISOString(),
          ...metrics,
        })
        if (error) throw new Error(error.message)
        inserted.push({ postId: a.postId, bucket: a.bucket })
      } else {
        // id 로 겨냥한다. (post_id, hours_since_publish) 로 걸면 그 사이 사람이
        // 같은 버킷을 manual 로 바꿔 넣었을 때 그것까지 덮는다.
        const { error } = await supabase
          .from('metric_snapshots')
          .update({ captured_at: new Date().toISOString(), ...metrics })
          .eq('id', a.snapshotId)
          // 사전 조회 이후 manual 로 바뀌었을 수 있다. 조건을 한 번 더 건다.
          .eq('source', 'api')
        if (error) throw new Error(error.message)
        updated.push({ postId: a.postId, bucket: a.bucket })
      }
    } catch (e) {
      // 한 글이 실패해도 나머지는 계속 수집한다. 창은 지나가면 끝이라
      // 전체를 중단시키는 쪽이 손실이 크다.
      const message = e instanceof Error ? e.message : String(e)
      console.error(`[collect] 실패 post=${a.postId} bucket=${a.bucket}: ${message}`)
      failed.push({ postId: a.postId, bucket: a.bucket, message })
    }

    await new Promise(r => setTimeout(r, CALL_SPACING_MS))
  }

  // 쿼터는 추정하지 않는다. 마지막으로 관측된 헤더를 남겨 실측으로 확인한다.
  // (헤더가 누적 사용률이라 이 실행에서 마지막 값이 곧 최고치다.)
  const finalUsage = usageBox.current
  if (finalUsage) {
    console.info(`[collect] usage app=${finalUsage.app ?? '-'} biz=${finalUsage.businessUseCase ?? '-'}`)
  }

  console.info(
    `[collect] 대상 ${targets.length} / 창 밖 ${plan.outOfWindow} → ` +
    `신규 ${inserted.length}, 갱신 ${updated.length}, 보류 ${plan.skipped.length}, 실패 ${failed.length}`,
  )

  return NextResponse.json({
    ok: failed.length === 0,
    scanned: targets.length,
    outOfWindow: plan.outOfWindow,
    inserted: inserted.length,
    updated: updated.length,
    // 스킵된 건은 반드시 드러낸다. manual 보호로 안 건드린 글을 응답에서 숨기면
    // "왜 이 글만 갱신이 안 되지"를 나중에 추적할 방법이 없다.
    skipped: plan.skipped,
    failed,
    usage: finalUsage,
  })
}
