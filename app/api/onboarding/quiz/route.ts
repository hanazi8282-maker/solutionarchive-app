import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  QUESTION_COUNT,
  buildQuiz,
  isCorrectPick,
  summarizeScore,
  type Side,
} from '@/lib/onboarding/quiz'
import {
  fetchCompletedScores,
  loadCorpora,
  logQuizEvents,
  type QuizEventRow,
} from '@/lib/onboarding/quiz-store'

// Stage 6 — 온보딩 "감 점수" 퀴즈.
//
//   GET  /api/onboarding/quiz?session_id=<uuid>   → 10문항 + start 이벤트 적재
//   POST /api/onboarding/quiz                      → answer·complete 적재 + 점수 요약
//
// ⚠️ GET 이 로그 1행을 쓴다(순수 조회가 아니다). 완주율(AC-1)의 분모가
//    "퀴즈를 받아간 세션"이어야 하고, 그 시점이 정확히 여기다. 별도 start
//    엔드포인트를 두면 클라이언트가 두 번 왕복해야 하고, 그 왕복 중 이탈한
//    세션이 분모에서 빠져 완주율이 실제보다 높게 나온다.
//
// 신원: session_id 는 클라이언트가 만들어 localStorage 에 보관하는 UUID 다.
// 이 리포에 아직 인증이 없다(lib/supabase/server.ts 가 service_role 로 RLS 우회,
// "TODO: Google SSO" 주석 그대로). user_id 는 SSO 도입 시 채운다 — 지금 쓰지 않는다.

const SESSION_MIN = 8
const SESSION_MAX = 64

function badSession(sessionId: string): boolean {
  return sessionId.length < SESSION_MIN || sessionId.length > SESSION_MAX
}

export async function GET(req: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 })

  const sessionId = new URL(req.url).searchParams.get('session_id')?.trim() ?? ''
  if (badSession(sessionId)) {
    return NextResponse.json({ error: 'session_id 가 필요합니다.' }, { status: 400 })
  }

  const corpora = await loadCorpora(supabase)
  if (!corpora) {
    return NextResponse.json({ error: '문제를 불러오지 못했습니다.' }, { status: 500 })
  }

  const questions = buildQuiz(corpora.moves, corpora.failedAngles, QUESTION_COUNT)
  if (questions.length === 0) {
    // 조회는 됐는데 페어를 만들 재료가 없다(음성). 빈 퀴즈를 정상으로 내보내지 않는다.
    return NextResponse.json(
      {
        error: '아직 퀴즈를 만들 사례가 부족합니다.',
        detail: { success_moves: corpora.moves.length, failed_angles: corpora.failedAngles.length },
      },
      { status: 503 },
    )
  }

  // 로그 적재 실패로 온보딩을 막지 않는다. 단 실패를 숨기지도 않는다 —
  // logged:false 가 내려오면 그 세션은 완주율 분모에 없다.
  const logged = await logQuizEvents(supabase, [{ session_id: sessionId, event_type: 'start' }])

  return NextResponse.json({ question_count: questions.length, questions, logged })
}

interface SubmitAnswer {
  case_move_id?: unknown
  failed_angle_id?: unknown
  picked_side?: unknown
  correct_side?: unknown
}

const isSide = (v: unknown): v is Side => v === 'a' || v === 'b'

export async function POST(req: Request) {
  const supabase = await createClient()
  if (!supabase) return NextResponse.json({ error: 'DB 연결 실패' }, { status: 500 })

  let body: { session_id?: unknown; answers?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '요청 본문을 읽지 못했습니다.' }, { status: 400 })
  }

  const sessionId = typeof body.session_id === 'string' ? body.session_id.trim() : ''
  if (badSession(sessionId)) {
    return NextResponse.json({ error: 'session_id 가 필요합니다.' }, { status: 400 })
  }

  const raw = Array.isArray(body.answers) ? (body.answers as SubmitAnswer[]) : null
  if (!raw || raw.length === 0 || raw.length > QUESTION_COUNT) {
    return NextResponse.json(
      { error: `answers 는 1~${QUESTION_COUNT}개여야 합니다.` },
      { status: 400 },
    )
  }

  // 신뢰 경계: id 가 실제 코퍼스 행인지 확인한다. 확인하지 않으면 학습
  // 데이터에 출처 없는 uuid 가 섞여 들어오고, 나중에 그걸 구분할 수 없다.
  const corpora = await loadCorpora(supabase)
  if (!corpora) {
    return NextResponse.json({ error: '채점에 실패했습니다.' }, { status: 500 })
  }
  const moveIds = new Set(corpora.moves.map((m) => m.id))
  const angleIds = new Set(corpora.failedAngles.map((f) => f.id))

  const answers: { moveId: string; angleId: string; picked: Side; correct: Side }[] = []
  for (const a of raw) {
    if (
      typeof a?.case_move_id !== 'string' ||
      typeof a?.failed_angle_id !== 'string' ||
      !isSide(a.picked_side) ||
      !isSide(a.correct_side) ||
      !moveIds.has(a.case_move_id) ||
      !angleIds.has(a.failed_angle_id)
    ) {
      return NextResponse.json({ error: '응답 형식이 올바르지 않습니다.' }, { status: 400 })
    }
    answers.push({
      moveId: a.case_move_id,
      angleId: a.failed_angle_id,
      picked: a.picked_side,
      correct: a.correct_side,
    })
  }

  const graded = answers.map((a) => ({ ...a, ok: isCorrectPick(a.correct, a.picked) }))
  const score = graded.filter((g) => g.ok).length
  const questionCount = graded.length

  const rows: QuizEventRow[] = graded.map((g) => ({
    session_id: sessionId,
    event_type: 'answer',
    pair_case_move_id: g.moveId,
    pair_failed_angle_id: g.angleId,
    picked_side: g.picked,
    is_correct: g.ok,
  }))
  rows.push({
    session_id: sessionId,
    event_type: 'complete',
    score,
    question_count: questionCount,
  })

  const logged = await logQuizEvents(supabase, rows)

  // 본인 complete 행이 들어간 뒤에 집계한다 → 응답자 수에 본인이 포함된다.
  const scores = await fetchCompletedScores(supabase)
  const summary = summarizeScore(score, questionCount, scores)

  return NextResponse.json({ summary, logged })
}
