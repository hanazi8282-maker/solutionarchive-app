// 발행 매처 — 사람이 Threads 앱에서 직접 올린 글을 posts 의 초안 행과 연결한다.
//
// ⛔ 이 라우트는 아무것도 발행하지 않는다(CLAUDE.md §10). 발행은 사람이 하고,
//    여기서는 "이미 올라간 글"을 읽어서 초안에 external_id 를 채울 뿐이다.
//    Threads API 호출은 GET /me/threads 하나뿐이다.
//
// 하는 일:
//   1. 최근 Threads 게시물을 읽는다
//   2. 이미 posts.external_id 에 있는 건 제외한다(재처리 방지)
//   3. status IN ('draft','pending_review') 인 posts 행들과 텍스트 유사도로
//      1:1 매칭한다 (lib/threads/match.ts)
//   4. 매칭된 행만 UPDATE — external_id / published_at / permalink / status='published'
//      + body 를 발행본으로 덮어쓴다(아래 📌 참조).
//      새 행은 절대 만들지 않는다. 못 붙인 건 목록으로 응답에 남기고, 사람이
//      /dashboard 의 "미매칭 초안" 섹션에서 직접 연결한다.
//
// 📥 왜 pending_review 도 스캔하는가
//
//    pending_review 는 "남헌이 발행 버튼을 누르기 직전" 상태다. 케이스 파이프라인이
//    올리는 초안은 전부 여기로 들어간다(CLAUDE.md §10.1). draft 는 그 이전 시기의
//    행들이다. 즉 **지금 실제로 발행되는 글은 거의 전부 pending_review 에서 나간다.**
//    그 상태를 스캔하지 않으면 매처는 정작 발행된 글을 못 붙인다.
//
//    자동으로 published 로 올리는 것이 승인 절차를 건너뛰는 게 아니냐 —
//    아니다. 여기서 매칭의 상대는 `GET /me/threads` 가 돌려준 **이미 올라가 있는
//    게시물**이다. 매칭됐다는 것은 사람이 그 글을 실제로 Threads 에 올렸다는
//    관측이다. 이 라우트는 그 사실을 기록할 뿐 발행을 일으키지 않는다.
//
//    ⚠️ 임계값은 draft 와 pending_review 에 **같은 값**을 쓴다. 상태별로 다르게
//       두면 안 된다: pending_review 에만 더 높은 문턱을 걸면, 같은 게시물을 두고
//       낮은 문턱의 draft 행이 먼저 가져가 성과가 엉뚱한 행에 붙는다. 막으려던
//       오연결을 문턱 비대칭이 직접 만들어내는 셈이다.
//
//       오탐 방지는 문턱이 아니라 lib/threads/match.ts 의 ambiguous·contested
//       판정이 맡는다. 그리고 스캔 대상을 넓히는 것 자체가 오탐을 **줄인다** —
//       진짜 주인 행이 후보에 들어와 1등을 가져가거나 contested 를 발생시키기
//       때문이다. 반대로 좁은 풀에서는 진짜 주인이 빠진 채 닮은 draft 하나가
//       단독 1등이 되어 조용히 잘못 붙는다.
//
// 📌 "진짜 발행본"은 posts.body 다 — notion_sync_log.published_body 가 아니다.
//
//    두 자리가 같은 글을 가리킨다. 우선순위는 마이그레이션
//    20260911000001_notion_sync_log_published_body.sql 이 이미 정해 뒀다:
//    **match-posts 가 정본, "<발행본>" 마커와 published_body 는 보조·교차검증.**
//
//    이유는 출처다. posts.body 는 Threads API 가 돌려준 게시물 텍스트 그대로고,
//    published_body 는 사람이 Notion 에 손으로 붙여넣은 사본이다. 붙여넣기가
//    누락되거나 늦거나 일부만 복사돼도 아무 신호가 없다. 성과 숫자를 만든 것은
//    독자가 실제로 본 글이므로 API 가 준 쪽이 정본이어야 한다.
//
//    그래서 이 라우트는 published_body 를 읽지 않고 쓰지도 않는다. 두 값이
//    다르면 그건 "붙여넣기가 어긋났다"는 신호지 여기서 해소할 충돌이 아니다.
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

// 스캔 대상 상태. 둘 다 "아직 발행으로 기록되지 않은" 행이고, 매칭되면 둘 다
// published 로 간다. 다른 상태(published·archived 등)는 건드리지 않는다.
const SCANNED_STATUSES = ['draft', 'pending_review'] as const
type ScannedStatus = (typeof SCANNED_STATUSES)[number]

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
  // status 를 함께 읽는다. 아래 UPDATE 가 "읽을 때의 그 상태일 때만" 쓰도록
  // 낙관적 동시성 조건으로 되돌려 쓴다 — 상태별 전이를 뭉뚱그리지 않는다.
  const { data: draftRows, error: draftErr } = await supabase
    .from('posts')
    .select('id, body, notes, created_at, status')
    .in('status', SCANNED_STATUSES)
    .order('created_at', { ascending: false })

  if (draftErr) {
    // 초안을 못 읽으면 매칭 자체가 성립하지 않는다. 조용히 0건 처리하면
    // "매칭될 게 없었다"와 구분되지 않으므로 실패로 끝낸다.
    console.error(`[match] 초안 조회 실패: ${draftErr.message}`)
    return NextResponse.json({ ok: false, message: `초안 조회 실패: ${draftErr.message}` }, { status: 500 })
  }

  const drafts = (draftRows ?? []) as (DraftRow & { notes: string | null; status: ScannedStatus })[]
  if (drafts.length === 0) {
    return NextResponse.json({ ok: true, matched: [], skipped: [], unmatchedThreads: [], message: '초안 없음 — Threads API 호출 생략' })
  }

  // 상태별 내역. "17건 스캔"만 남기면 pending_review 확장이 실제로 대상에
  // 들어왔는지 사후에 확인할 수 없다.
  const scannedByStatus = drafts.reduce<Record<string, number>>((acc, d) => {
    acc[d.status] = (acc[d.status] ?? 0) + 1
    return acc
  }, {})

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
  const applied: { draftId: string; threadsId: string; score: number; from: ScannedStatus }[] = []
  const failed: { draftId: string; threadsId: string; message: string }[] = []

  for (const m of outcome.matched) {
    if (!m.timestamp) {
      // published_at 없이 status='published' 로 올리면
      // posts_published_at_required_check 에 걸린다. 여기서 걸러 수동 연결로 넘긴다.
      failed.push({ draftId: m.draftId, threadsId: m.threadsId, message: 'timestamp 없음 — 수동 연결 필요' })
      continue
    }

    const draft = drafts.find(d => d.id === m.draftId)
    if (!draft) {
      // matchDrafts 는 우리가 넘긴 행에서만 id 를 만든다. 여기 걸리면 매칭 입력과
      // 결과가 어긋난 것이라 상태 전이 조건을 정할 수 없다 — 추측으로 쓰지 않는다.
      failed.push({ draftId: m.draftId, threadsId: m.threadsId, message: '매칭 결과의 초안 행을 못 찾음 — 확인 불가' })
      continue
    }
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
    const simNote = m.exact ? null : `[match] 유사도 ${m.score.toFixed(3)} — 발행본이 초안과 다름`

    // pending_review 는 사람의 발행 승인을 기다리던 행이다. 그 행이 승인 화면을
    // 거치지 않고 published 가 된 경위(= Threads 에 이미 올라간 것을 관측했다)를
    // 행 자체에 남긴다. 응답 로그는 휘발하지만 notes 는 행과 함께 남는다.
    const promoNote = draft.status === 'pending_review'
      ? `[match] pending_review → published — Threads 게시물 ${m.threadsId} 관측으로 확정(사람이 이미 발행함)`
      : null

    const merged = [draft.notes, promoNote, simNote].filter(Boolean).join('\n')
    const notes = (promoNote || simNote) ? merged : undefined

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
      // 읽을 때의 그 상태일 때만 갱신한다. draft 는 draft 일 때만, pending_review 는
      // pending_review 일 때만 — 한 값으로 뭉뚱그리면 그 사이에 상태가 바뀐 행을
      // 덮어쓴다. 사람이 대시보드에서 방금 수동 연결했거나 승인 화면에서 상태를
      // 옮겼다면 이 크론이 그 결과를 되돌리면 안 된다.
      .eq('status', draft.status)
      .select('id')

    if (error) {
      console.error(`[match] 갱신 실패 draft=${m.draftId} threads=${m.threadsId}: ${error.message}`)
      failed.push({ draftId: m.draftId, threadsId: m.threadsId, message: error.message })
      continue
    }
    if (!data || data.length === 0) {
      // 0행 = 낙관적 조건 불일치. 읽은 뒤 갱신 전에 누가 상태를 바꿨다는 뜻이라
      // 어느 상태를 기대했는지까지 남긴다. "건너뜀"만 남기면 원인을 못 좁힌다.
      failed.push({ draftId: m.draftId, threadsId: m.threadsId, message: `이미 ${draft.status} 가 아님 — 건너뜀` })
      continue
    }

    applied.push({ draftId: m.draftId, threadsId: m.threadsId, score: Number(m.score.toFixed(3)), from: draft.status })
  }

  const summary = {
    ok: failed.length === 0,
    draftsScanned: drafts.length,
    // 상태별 스캔 내역. pending_review 가 실제로 대상에 들었는지 여기서 본다.
    scannedByStatus,
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

  const scanBreakdown = SCANNED_STATUSES.map(s => `${s} ${scannedByStatus[s] ?? 0}`).join(' + ')
  const appliedFrom = SCANNED_STATUSES.map(s => `${s} ${applied.filter(a => a.from === s).length}`).join(' + ')
  console.info(`[match] 초안 ${drafts.length}(${scanBreakdown}) / 게시물 ${threads.length} → 연결 ${applied.length}(${appliedFrom}), 보류 ${summary.skipped.length}, 실패 ${failed.length}`)

  return NextResponse.json(summary)
}

// Threads 는 사용량을 헤더로만 알려준다. 남겨두지 않으면 한도에 닿았을 때
// 원인을 사후에 확인할 방법이 없다.
function logRateLimit(res: Response) {
  const app = res.headers.get('x-app-usage')
  const biz = res.headers.get('x-business-use-case-usage')
  if (app || biz) console.info(`[match] usage app=${app ?? '-'} biz=${biz ?? '-'}`)
}
