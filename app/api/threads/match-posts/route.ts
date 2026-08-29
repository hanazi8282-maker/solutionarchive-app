// 발행 매처 — 사람이 Threads 앱에서 직접 올린 글을 posts 의 초안 행과 연결한다.
//
// ⛔ 이 라우트는 아무것도 발행하지 않는다(CLAUDE.md §10). 발행은 사람이 하고,
//    여기서는 "이미 올라간 글"을 읽어서 초안에 external_id 를 채울 뿐이다.
//    Threads API 호출은 GET /me/threads 하나뿐이다.
//
// 하는 일:
//   1. 최근 Threads 게시물을 읽는다
//   2. 이미 posts.external_id 에 있는 건 제외한다(재처리 방지)
//   3. status='draft' 인 posts 행들과 텍스트 유사도로 1:1 매칭한다 (lib/threads/match.ts)
//   4. 매칭된 행만 UPDATE — external_id / published_at / permalink / status='published'
//      + body 를 발행본으로 덮어쓴다(아래 📌 참조).
//      새 행은 절대 만들지 않는다. 못 붙인 건 목록으로 응답에 남기고, 사람이
//      /dashboard 의 "미매칭 초안" 섹션에서 직접 연결한다.
//
// ⏰ 스케줄: 0 * * * * (매시 정각). collect-metrics 는 30 * * * * (매시 30분)다.
//
//    ⚠️ 이 30분 어긋남은 취향이 아니라 1h 버킷을 살리기 위한 장치다.
//       "왜 30분이지" 하고 정각으로 맞추면 조용히 깨진다. 고치기 전에 읽을 것.
//
//    collect-metrics 는 status='published' 인 행만 수집한다. 즉 매처가 먼저 돌아
//    초안을 published 로 올려두지 않으면 그 글은 수집 대상에조차 들지 않는다.
//
//    두 크론을 똑같이 0 * * * * 로 두면 Vercel 이 같은 정각의 실행 순서를
//    보장하지 않는다. collect 가 먼저 돌면 그 글은 아직 draft 라 못 본다.
//    그러면 다음 정각에는 나이가 이미 1h 창의 상한(1.9h)을 넘어서 views_1h 가
//    영구히 빈다 — 지나간 시점의 조회수는 뒤늦게 채울 방법이 없다.
//
//    views_1h 가 없으면 post_performance.spread_multiple(= views_24h / views_1h)이
//    항상 NULL 이고 H3(자답글이 확산배수를 올린다)을 아예 검증할 수 없다.
//
//    매처를 정각, 수집을 30분에 두면 "매칭 → 수집" 순서가 고정되고 수집 시점의
//    글 나이가 항상 0.5~1.5h 로 수렴해 1h 창(0.5~1.9) 한가운데에 들어온다.
//
//    vercel.json 은 순수 JSON 이라 주석을 못 넣는다. 그래서 이 설명이 여기 있다.

import { NextResponse } from 'next/server'
import { requireCronAuth } from '@/lib/cron-auth'
import { createClient } from '@/lib/supabase/server'
import { ensureValidToken } from '@/lib/threads/token'
import { matchDrafts, type DraftRow, type ThreadsPost } from '@/lib/threads/match'

const BASE = 'https://graph.threads.net'

// 읽어올 게시물 수. 하루 4~5편 × 며칠치 + 자답글까지 감안한 여유값이다.
const FETCH_LIMIT = 50

// 이 기간보다 오래된 게시물은 보지 않는다. collect-metrics 가 14일 이내만
// 수집하므로 그보다 오래된 글을 지금 연결해도 성과 데이터가 붙지 않는다.
// (그런 초안은 대시보드에서 수동 연결한다 — 기록 자체는 남길 수 있어야 하니까)
const LOOKBACK_DAYS = 14

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
    // 토큰 문제는 크론이 고칠 수 없다. refresh-token 라우트와 같은 규약으로
    // 200 + needsReauth 를 돌려 알람 소음을 만들지 않는다.
    return NextResponse.json({ ok: false, needsReauth: true, message: 'Threads 재인증 필요' })
  }

  // ── 1) 초안 로드 ───────────────────────────────────────────────
  const { data: draftRows, error: draftErr } = await supabase
    .from('posts')
    .select('id, body, notes, created_at')
    .eq('status', 'draft')
    .order('created_at', { ascending: false })

  if (draftErr) {
    // 초안을 못 읽으면 매칭 자체가 성립하지 않는다. 조용히 0건 처리하면
    // "매칭될 게 없었다"와 구분되지 않으므로 실패로 끝낸다.
    console.error(`[match] 초안 조회 실패: ${draftErr.message}`)
    return NextResponse.json({ ok: false, message: `초안 조회 실패: ${draftErr.message}` }, { status: 500 })
  }

  const drafts = (draftRows ?? []) as (DraftRow & { notes: string | null })[]
  if (drafts.length === 0) {
    return NextResponse.json({ ok: true, matched: [], skipped: [], unmatchedThreads: [], message: '초안 없음 — Threads API 호출 생략' })
  }

  // ── 2) 이미 연결된 Threads id ─────────────────────────────────
  const { data: linkedRows, error: linkedErr } = await supabase
    .from('posts')
    .select('external_id')
    .not('external_id', 'is', null)

  if (linkedErr) {
    // 이 목록이 없으면 이미 연결된 게시물을 다시 후보로 올리게 되고,
    // UNIQUE(external_id) 위반이나 오연결로 이어진다. 추측으로 진행하지 않는다.
    console.error(`[match] 기연결 external_id 조회 실패: ${linkedErr.message}`)
    return NextResponse.json({ ok: false, message: `기연결 조회 실패: ${linkedErr.message}` }, { status: 500 })
  }

  const linked = new Set((linkedRows ?? []).map(r => r.external_id as string))

  // ── 3) Threads 게시물 조회 ────────────────────────────────────
  const since = Math.floor((Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000) / 1000)
  const url = new URL(`${BASE}/me/threads`)
  url.searchParams.set('fields', 'id,text,permalink,timestamp')
  url.searchParams.set('limit', String(FETCH_LIMIT))
  url.searchParams.set('since', String(since))
  url.searchParams.set('access_token', creds.accessToken)

  const res = await fetch(url, { method: 'GET' })
  const json = await res.json().catch(() => ({}))

  if (!res.ok || !Array.isArray(json.data)) {
    console.error(`[match] /me/threads 실패 (HTTP ${res.status}): ${JSON.stringify(json)}`)
    return NextResponse.json(
      { ok: false, message: `Threads 조회 실패 (HTTP ${res.status})`, detail: json },
      { status: 502 },
    )
  }

  logRateLimit(res)

  const threads: ThreadsPost[] = (json.data as ThreadsPost[]).filter(t => t.id && !linked.has(t.id))

  // ── 4) 매칭 ───────────────────────────────────────────────────
  const outcome = matchDrafts(drafts, threads)

  // ── 5) 반영 ───────────────────────────────────────────────────
  const applied: { draftId: string; threadsId: string; score: number }[] = []
  const failed: { draftId: string; threadsId: string; message: string }[] = []

  for (const m of outcome.matched) {
    if (!m.timestamp) {
      // published_at 없이 status='published' 로 올리면
      // posts_published_at_required_check 에 걸린다. 여기서 걸러 수동 연결로 넘긴다.
      failed.push({ draftId: m.draftId, threadsId: m.threadsId, message: 'timestamp 없음 — 수동 연결 필요' })
      continue
    }

    const draft = drafts.find(d => d.id === m.draftId)
    const published = threads.find(t => t.id === m.threadsId)

    // 📌 body 는 발행본으로 덮어쓴다.
    //    분석의 기준은 "우리가 쓰려던 글"이 아니라 "독자가 실제로 본 글"이다.
    //    반응(views/replies/likes)을 만들어낸 것은 발행본이므로, 초안 본문을
    //    남겨두면 성과 숫자와 본문이 서로 다른 텍스트를 가리키게 된다.
    //
    //    초안이 유실되지는 않는다 — 생성 단계(STEP 2)가 drafts/YYYY-MM-DD.md 로
    //    파일을 남기고 그 파일이 초안 아카이브다.
    //
    //    빈 문자열·누락은 덮어쓰지 않는다. posts.body 가 NOT NULL 이기도 하고,
    //    Threads 가 text 를 안 준 경우(이미지 전용 글 등)에 본문을 지워버리면
    //    되돌릴 방법이 없다.
    const publishedBody = published?.text?.trim() || null

    // 유사도 기록은 유지한다. 발행 직전에 얼마나 손댔는지가 그 자체로 학습
    // 신호다(0.9 대는 다듬기, 0.85 대는 훅 교체 — 이 차이가 나중에 의미를 갖는다).
    // body 를 덮어쓰고 나면 이 숫자 말고는 수정 폭을 알 방법이 남지 않는다.
    const note = m.exact ? null : `[match] 유사도 ${m.score.toFixed(3)} — 발행본이 초안과 다름`
    const notes = note
      ? [draft?.notes, note].filter(Boolean).join('\n')
      : undefined

    const { error, data } = await supabase
      .from('posts')
      .update({
        external_id: m.threadsId,
        published_at: new Date(m.timestamp).toISOString(),
        permalink: m.permalink,
        status: 'published',
        ...(publishedBody !== null ? { body: publishedBody } : {}),
        ...(notes !== undefined ? { notes } : {}),
      })
      .eq('id', m.draftId)
      // 여전히 draft 일 때만 갱신한다. 사람이 대시보드에서 방금 수동 연결했다면
      // 그 결과를 이 크론이 덮어쓰면 안 된다.
      .eq('status', 'draft')
      .select('id')

    if (error) {
      console.error(`[match] 갱신 실패 draft=${m.draftId} threads=${m.threadsId}: ${error.message}`)
      failed.push({ draftId: m.draftId, threadsId: m.threadsId, message: error.message })
      continue
    }
    if (!data || data.length === 0) {
      failed.push({ draftId: m.draftId, threadsId: m.threadsId, message: '이미 draft 가 아님 — 건너뜀' })
      continue
    }

    applied.push({ draftId: m.draftId, threadsId: m.threadsId, score: Number(m.score.toFixed(3)) })
  }

  const summary = {
    ok: failed.length === 0,
    draftsScanned: drafts.length,
    threadsScanned: threads.length,
    applied,
    failed,
    // 자동 연결하지 않은 초안. 대시보드 수동 연결 섹션이 처리할 대상이다.
    skipped: outcome.skipped.map(s => ({
      draftId: s.draftId,
      reason: s.reason,
      bestScore: Number(s.bestScore.toFixed(3)),
      runnerUpScore: s.runnerUpScore === null ? null : Number(s.runnerUpScore.toFixed(3)),
      bestThreadsId: s.bestThreadsId,
    })),
    // 어떤 초안과도 안 붙은 게시물. 대개 매처 도입 이전 글이거나 자답글이다.
    unmatchedThreads: outcome.unmatchedThreads,
  }

  console.info(`[match] 초안 ${drafts.length} / 게시물 ${threads.length} → 연결 ${applied.length}, 보류 ${summary.skipped.length}, 실패 ${failed.length}`)

  return NextResponse.json(summary)
}

// Threads 는 사용량을 헤더로만 알려준다. 남겨두지 않으면 한도에 닿았을 때
// 원인을 사후에 확인할 방법이 없다.
function logRateLimit(res: Response) {
  const app = res.headers.get('x-app-usage')
  const biz = res.headers.get('x-business-use-case-usage')
  if (app || biz) console.info(`[match] usage app=${app ?? '-'} biz=${biz ?? '-'}`)
}
