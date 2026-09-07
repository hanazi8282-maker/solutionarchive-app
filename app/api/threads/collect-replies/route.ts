// 답글 본문 수집 — 발행 글에 달린 댓글을 post_replies 에 적재한다.
//
// ⛔ 이 라우트는 아무것도 발행하지 않는다(CLAUDE.md §10). 읽기 전용 conversation 조회 +
//    우리 테이블 쓰기뿐이다. Threads 에 답글을 달거나 숨기지 않는다.
//
// ⏰ 스케줄: 45 * * * * (매시 45분). 매처 :00, 지표 수집 :30 과 어긋냄 —
//    셋이 겹치면 Vercel 이 한 시간 안에 몰아 실행하며 쿼터를 태운다.
//
//    답글은 지표(h1/h24/h168 버킷)와 달리 "언제든" 달리므로 창 판정이 없다.
//    발행 후 COLLECT_DAYS 안의 글은 매시간 conversation 을 통째로 다시 읽고
//    새 답글만 골라 넣는다(planReplyUpserts).
//
// 순수 로직(upsert 계획·삭제 감지)은 lib/threads/replies.ts 에 있고
// scripts/threads-replies-selftest.mjs 가 검증한다. 여기는 실행만.

import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { createClient } from '@/lib/supabase/server'
import { ensureValidToken } from '@/lib/threads/token'
import type { ThreadsUsage } from '@/lib/threads/insights'
import {
  fetchConversation,
  planReplyUpserts,
  type ExistingReply,
} from '@/lib/threads/replies'

// 지표 수집 창(180h)보다 넉넉히. 답글은 발행 한참 뒤에도 달리지만, 30일이 지나면
// 매시간 다시 훑는 비용이 얻는 것보다 크다. 그 뒤의 답글은 놓친다(설계상 허용).
const COLLECT_DAYS = 30

// conversation 호출 사이 간격. Threads 앱 단위 시간당 한도 보호.
const CALL_SPACING_MS = 250

export async function GET(req: Request) { return POST(req) }

export async function POST(req: Request) {
  const denied = requireCronAuth(req)
  if (denied) return denied

  const supabase = await createClient()
  if (!supabase) {
    return NextResponse.json({ ok: false, message: 'Supabase 환경변수 없음' }, { status: 500 })
  }

  const creds = await ensureValidToken()
  if (!creds) {
    // 토큰 문제는 크론이 못 고친다. collect-metrics 와 같은 규약 — 200 + needsReauth.
    return NextResponse.json({ ok: false, needsReauth: true, message: 'Threads 재인증 필요' })
  }

  const since = new Date(Date.now() - COLLECT_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const { data: posts, error: postErr } = await supabase
    .from('posts')
    .select('id, external_id, published_at')
    .eq('status', 'published')
    .not('external_id', 'is', null)
    .gte('published_at', since)
    .order('published_at', { ascending: false })

  if (postErr) {
    // 🔴 error 를 구조분해해서 본다. 조용히 null → "대상 없음" 으로 오인하면
    //    테이블 부재·권한 오류가 정상 응답으로 위장된다(collect-metrics 와 같은 교훈).
    console.error(`[replies] 대상 글 조회 실패: ${postErr.message}`)
    return NextResponse.json({ ok: false, message: `대상 글 조회 실패: ${postErr.message}` }, { status: 500 })
  }

  const targets = posts ?? []
  if (targets.length === 0) {
    return NextResponse.json({
      ok: true, scanned: 0, fetched: 0, inserted: 0, updated: 0, touched: 0, missing: 0,
      message: `${COLLECT_DAYS}일 내 발행 글 없음 — conversation 호출 생략`,
    })
  }

  const usageBox: { current: ThreadsUsage | null } = { current: null }
  let fetched = 0
  const inserted: string[] = []
  const updated: string[] = []
  let touched = 0
  const missing: { postId: string; count: number; ids: string[] }[] = []
  const failed: { postId: string; message: string }[] = []

  for (const p of targets) {
    try {
      const raw = await fetchConversation(p.external_id as string, creds.accessToken, u => { usageBox.current = u })
      fetched += raw.length

      const { data: existRows, error: existErr } = await supabase
        .from('post_replies')
        .select('id, text, hide_status')
        .eq('post_id', p.id)
      if (existErr) throw new Error(`기존 답글 조회 실패: ${existErr.message}`)

      const plan = planReplyUpserts(
        p.id, p.external_id as string, raw, (existRows ?? []) as ExistingReply[],
      )

      if (plan.inserts.length) {
        const { error } = await supabase.from('post_replies').insert(
          plan.inserts.map(r => ({ ...r, raw: r.raw as unknown as object })),
        )
        if (error) throw new Error(`insert 실패: ${error.message}`)
        inserted.push(...plan.inserts.map(r => r.id))
      }

      for (const u of plan.updates) {
        const { error } = await supabase
          .from('post_replies')
          .update({
            text: u.text, hide_status: u.hide_status, is_own: u.is_own,
            parent_id: u.parent_id, permalink: u.permalink,
            last_seen_at: new Date().toISOString(),
            raw: u.raw as unknown as object,
          })
          .eq('id', u.id)
        if (error) throw new Error(`update 실패 ${u.id}: ${error.message}`)
        updated.push(u.id)
      }

      if (plan.touchIds.length) {
        const { error } = await supabase
          .from('post_replies')
          .update({ last_seen_at: new Date().toISOString() })
          .in('id', plan.touchIds)
        if (error) throw new Error(`touch 실패: ${error.message}`)
        touched += plan.touchIds.length
      }

      if (plan.missingIds.length) {
        // 삭제 추정. v1 은 지우지 않고 드러내기만 한다.
        missing.push({ postId: p.id, count: plan.missingIds.length, ids: plan.missingIds })
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      console.error(`[replies] 실패 post=${p.id} media=${p.external_id}: ${message}`)
      failed.push({ postId: p.id, message })
    }

    await new Promise(r => setTimeout(r, CALL_SPACING_MS))
  }

  const finalUsage = usageBox.current
  if (finalUsage) {
    console.info(`[replies] usage app=${finalUsage.app ?? '-'} biz=${finalUsage.businessUseCase ?? '-'}`)
  }
  console.info(
    `[replies] 대상 ${targets.length} / 응답 ${fetched} → ` +
    `신규 ${inserted.length}, 갱신 ${updated.length}, 유지 ${touched}, 유실추정 ${missing.reduce((a, m) => a + m.count, 0)}, 실패 ${failed.length}`,
  )

  return NextResponse.json({
    ok: failed.length === 0,
    scanned: targets.length,
    fetched,
    inserted: inserted.length,
    updated: updated.length,
    touched,
    missing,
    failed,
    usage: finalUsage,
  })
}
