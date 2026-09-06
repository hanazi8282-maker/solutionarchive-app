#!/usr/bin/env node
// 케이스 무브 → Threads 발행-대기 초안을 DB 에 올린다 (M2 마지막 단계).
//
// ⛔ 이 스크립트는 **어떤 경우에도 Threads 에 게시하지 않는다.**
//    CLAUDE.md §10 — 자동 발행 API 사용 안 함. 여기서 만드는 건 "사람이
//    앱에서 발행 버튼을 누르기 직전 상태"까지다. 발행 API 호출 코드는
//    이 파일에 존재하지 않고, 앞으로도 넣지 않는다.
//
// 하는 일
//   1) content_items 에 소재 행 (status='proposed', source_case=케이스 slug)
//   2) posts 에 초안 행 (status='pending_review', published_at=NULL)
//   3) post_decision_link 로 판정 로그 LOG-20260906-01 과 연결
//
// ⚠️ pending_review 는 마이그레이션 20260906000002 가 적용돼야 들어간다.
//    §12-5 상 마이그레이션은 대시보드에서만 돌리므로, 미적용 상태에서는
//    23514(check_violation) 가 난다. 그때 조용히 draft 로 눕히고 끝내면
//    "게이트 통과한 발행-대기"와 "아직 게이트도 안 돈 생초안"이 같은 값이
//    되어 버린다 (§7.1: 확인 실패를 정상으로 접지 마라). 그래서 폴백은
//    하되 **폴백했다는 사실을 화면에 크게 남기고 종료 코드도 다르게** 낸다.
//
// 종료 코드: 0 = pending_review 로 저장 / 3 = draft 폴백(마이그 미적용) / 2 = 확인 불가
import { readFileSync } from 'node:fs'
import { createClient } from '../lib/supabase/server.ts'
import { linkDecisionLog } from '../lib/predictions/link.ts'

const CHANNEL_ID = '64558fd1-06a5-4440-8fb1-bb78375479e0' // threads / @solution_arch_
const CASE_SLUG = 'warby-parker-home-try-on'
const MOVE_ID = 'c7317212-7ef6-41c6-8e48-5fe4244ca61c'
const LOG_CODE = 'LOG-20260906-01'
const CONTENT_CODE = 'CS-20260906-01'
const BODY_PATH = 'drafts/threads/2026-09-06-warby-home-try-on.body.txt'
const REPLY_PATH = 'drafts/threads/2026-09-06-warby-home-try-on.selfreply.txt'

// createClient 는 async 다. await 를 빼면 Promise 가 들어와 supabase.from 이 없다.
let supabase
try {
  supabase = await createClient()
} catch (e) {
  console.error(`⚠️ 확인 불가: Supabase 클라이언트 생성 실패 — ${e.message}`)
  process.exit(2)
}

const body = readFileSync(BODY_PATH, 'utf-8').replace(/\r\n/g, '\n').trim()
const selfReply = readFileSync(REPLY_PATH, 'utf-8').replace(/\r\n/g, '\n').trim()
const charCount = [...body].length

if (charCount > 500) {
  console.error(`⚠️ 본문 ${charCount}자 — Threads 상한 500 초과. 저장하지 않는다 (G-11).`)
  process.exit(2)
}

// ── 1) 소재 행 ────────────────────────────────────────────────
const item = {
  code: CONTENT_CODE,
  tier: 1,
  title: '병목을 푼 장치에는 유효기간이 있다',
  twist_line: '신뢰를 대신 사주던 장치를 껐더니 새 고객 붙는 속도가 반으로 줄었다',
  source_case: CASE_SLUG,
  status: 'proposed', // 자동 제안. 사람이 고르기 전까지 초안에 안 잡힌다
}
{
  const { error } = await supabase.from('content_items').upsert(item, { onConflict: 'code' })
  if (error) {
    console.error(`⚠️ 확인 불가: content_items 저장 실패 — ${error.code} ${error.message}`)
    process.exit(2)
  }
  console.log(`✅ content_items ${CONTENT_CODE} (status=proposed)`)
}

// ── 2) 초안 행 ────────────────────────────────────────────────
//
// ★ 등급을 여기 하드코딩하지 않는다. 재채점(case-review.mjs regrade)으로 바뀌는 값이라
//   박아 두면 초안 안의 출처 표기가 조용히 옛말이 된다. 실제로 '등급 A' 로 적혀 있었는데
//   L-56 백필 후 이 무브는 B 가 됐다 — 발행 대기 중인 글이 틀린 근거 표기를 달고 있었다.
const moveRes = await supabase.from('case_moves')
  .select('lever, evidence_grade, outcome_direction, case_studies(bottleneck)')
  .eq('id', MOVE_ID).maybeSingle()
if (moveRes.error || !moveRes.data) {
  console.error(`⚠️ 확인 불가: case_moves ${MOVE_ID} 조회 실패 — ${moveRes.error?.code ?? '행 없음'} ${moveRes.error?.message ?? ''}`)
  process.exit(2)
}
const move = moveRes.data
const bottleneck = move.case_studies?.bottleneck ?? '?'
if (move.evidence_grade !== 'A') {
  console.log(`⚠️ 이 초안이 딛고 선 무브의 등급이 ${move.evidence_grade} 다 (A 가 아니다).`)
  console.log('   저장은 하되 그 사실을 초안 메모에 적는다. 발행 여부는 사람이 다시 판단할 자리다.')
}

const notes = [
  `케이스 ${CASE_SLUG} / case_moves ${MOVE_ID} (${bottleneck} · ${move.lever} · 등급 ${move.evidence_grade} · ${move.outcome_direction})`,
  `판정 로그 ${LOG_CODE} / 게이트 판정 전문 drafts/threads/2026-09-06-warby-home-try-on.md`,
  `게이트: 예외통과 (U-3 ②항 미충족 — 레퍼런스 4건의 댓글 실물 미확보)`,
  `자기답글(고정 댓글, ${[...selfReply].length}자):\n${selfReply}`,
  `⛔ 미발행. 발행 버튼은 사람이 Threads 앱에서 직접 누른다 (CLAUDE.md §10).`,
].join('\n\n')

const base = {
  channel_id: CHANNEL_ID,
  body,
  char_count: charCount,
  content_code: CONTENT_CODE,
  hook_type: '상식파괴형',
  closing_type: '질문',
  topic_tag: 'case-study',
  published_at: null, // 발행 시각은 사람이 실제로 게시한 뒤에 생긴다
  notes,
}

let postId = null
let savedStatus = null
let fellBack = false

const existing = await supabase.from('posts').select('id,status').eq('content_code', CONTENT_CODE).maybeSingle()
if (existing.error) {
  console.error(`⚠️ 확인 불가: posts 조회 실패 — ${existing.error.code} ${existing.error.message}`)
  process.exit(2)
}

async function write(status) {
  const row = { ...base, status }
  if (existing.data) {
    return await supabase.from('posts').update(row).eq('id', existing.data.id).select('id,status').single()
  }
  return await supabase.from('posts').insert(row).select('id,status').single()
}

{
  let res = await write('pending_review')
  if (res.error && res.error.code === '23514') {
    // CHECK 위반 = 마이그레이션 20260906000002 미적용. 눕히되 티를 낸다.
    fellBack = true
    res = await write('draft')
  }
  if (res.error) {
    console.error(`⚠️ 확인 불가: posts 저장 실패 — ${res.error.code} ${res.error.message}`)
    process.exit(2)
  }
  postId = res.data.id
  savedStatus = res.data.status
  console.log(`✅ posts ${postId} (status=${savedStatus}, ${charCount}자, published_at=null)`)
}

// ── 3) 판정 로그 연결 ─────────────────────────────────────────
{
  const r = await linkDecisionLog(supabase, { postId, decisionLogCode: LOG_CODE, role: 'primary' })
  const ok = r.status === 'linked' || r.status === 'exists'
  console.log(`${ok ? '✅' : '⚠️'} post_decision_link ${postId} ↔ ${LOG_CODE} — ${r.status}${r.reason ? ` (${r.reason})` : ''}`)
  if (!ok) {
    console.error('⚠️ 연결 실패 — 초안이 어느 판정에서 나왔는지 DB 에서 추적 불가 상태다.')
    process.exit(2)
  }
}

console.log('')
if (fellBack) {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log("⚠️ status='draft' 로 폴백했다. 이건 '게이트를 안 돌린 초안'이라는 뜻이 아니다.")
  console.log('   마이그레이션 20260906000002_posts_pending_review.sql 가 아직 적용되지 않아')
  console.log("   CHECK 가 'pending_review' 를 거부했다 (23514). 대시보드 SQL Editor 에서")
  console.log('   적용한 뒤 이 스크립트를 다시 돌리면 정상 값으로 올라간다 (§12-5).')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
}
console.log('⛔ 발행하지 않았다. 어떤 Threads API 도 호출하지 않았다 (CLAUDE.md §10).')
process.exit(fellBack ? 3 : 0)
