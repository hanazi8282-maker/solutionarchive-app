'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  scoreHeadline,
  type QuizQuestion,
  type ScoreSummary,
  type Side,
} from '@/lib/onboarding/quiz'

// Stage 6 — 온보딩 "감 점수" 퀴즈 화면.
//
// 익명으로 돈다. session_id 는 여기서 만들어 localStorage 에 보관한다 — 이
// 리포에 아직 인증이 없고(lib/supabase/server.ts 의 "TODO: Google SSO"), 온보딩은
// 정의상 로그인 이전 경험이다. 로그인이 들어오면 서버가 user_id 를 채운다.

const SESSION_KEY = 'sa_onboarding_session_id'

function getSessionId(): string {
  try {
    const saved = localStorage.getItem(SESSION_KEY)
    if (saved && saved.length >= 8) return saved
    const fresh = crypto.randomUUID()
    localStorage.setItem(SESSION_KEY, fresh)
    return fresh
  } catch {
    // 프라이빗 모드 등에서 localStorage 가 막혀도 퀴즈는 돌아야 한다.
    // 세션이 저장되지 않으니 재방문은 새 세션으로 집계된다.
    return crypto.randomUUID()
  }
}

interface Pick {
  case_move_id: string
  failed_angle_id: string
  picked_side: Side
  correct_side: Side
}

const CARD: React.CSSProperties = {
  flex: 1,
  minWidth: 260,
  padding: '20px 22px',
  border: '1px solid #d4d4d8',
  borderRadius: 12,
  background: '#fff',
  textAlign: 'left',
  fontSize: 16,
  lineHeight: 1.6,
  cursor: 'pointer',
}

export default function OnboardingQuizPage() {
  const [sessionId, setSessionId] = useState('')
  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null)
  const [cursor, setCursor] = useState(0)
  const [picks, setPicks] = useState<Pick[]>([])
  const [summary, setSummary] = useState<ScoreSummary | null>(null)
  const [logged, setLogged] = useState<boolean | null>(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const sid = getSessionId()
    setSessionId(sid)
    let alive = true
    fetch(`/api/onboarding/quiz?session_id=${encodeURIComponent(sid)}`)
      .then(async (res) => {
        const json = await res.json().catch(() => null)
        if (!alive) return
        if (!res.ok || !json?.questions?.length) {
          setError(json?.error ?? '퀴즈를 불러오지 못했습니다.')
          return
        }
        setQuestions(json.questions as QuizQuestion[])
      })
      .catch(() => alive && setError('퀴즈를 불러오지 못했습니다.'))
    return () => {
      alive = false
    }
  }, [])

  const submit = useCallback(
    async (all: Pick[]) => {
      setSubmitting(true)
      try {
        const res = await fetch('/api/onboarding/quiz', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session_id: sessionId, answers: all }),
        })
        const json = await res.json().catch(() => null)
        if (!res.ok || !json?.summary) {
          setError(json?.error ?? '채점에 실패했습니다.')
          return
        }
        setSummary(json.summary as ScoreSummary)
        setLogged(Boolean(json.logged))
      } catch {
        setError('채점에 실패했습니다.')
      } finally {
        setSubmitting(false)
      }
    },
    [sessionId],
  )

  function choose(q: QuizQuestion, side: Side) {
    const next = [
      ...picks,
      {
        case_move_id: q.case_move_id,
        failed_angle_id: q.failed_angle_id,
        picked_side: side,
        correct_side: q.correct_side,
      },
    ]
    setPicks(next)
    if (questions && next.length >= questions.length) void submit(next)
    else setCursor((c) => c + 1)
  }

  const wrap: React.CSSProperties = { maxWidth: 860, margin: '0 auto', padding: '40px 20px' }

  if (error) {
    return (
      <main style={wrap}>
        <h1 style={{ fontSize: 22 }}>소구점 판정 감 점수</h1>
        <p style={{ color: '#b91c1c' }}>{error}</p>
      </main>
    )
  }

  if (summary) {
    const shareUrl = `/api/onboarding/quiz/share?score=${summary.score}&total=${summary.question_count}`
    return (
      <main style={wrap}>
        <h1 style={{ fontSize: 22 }}>내 감 점수</h1>
        <p style={{ fontSize: 28, margin: '12px 0' }}>{scoreHeadline(summary)}</p>
        {summary.percentile === null && summary.respondents !== null && (
          <p style={{ color: '#52525b', fontSize: 14 }}>
            응답자가 30명을 넘으면 상위 몇 %인지도 같이 보여드립니다. 지금은 표본이 작아
            퍼센타일을 계산하지 않습니다.
          </p>
        )}
        {summary.respondents === null && (
          <p style={{ color: '#b45309', fontSize: 14 }}>
            응답자 집계를 읽지 못했습니다 — 점수만 표시합니다.
          </p>
        )}
        {logged === false && (
          <p style={{ color: '#b45309', fontSize: 14 }}>
            응답 기록에는 실패했습니다(집계에 반영되지 않습니다).
          </p>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={shareUrl}
          alt={`감 점수 공유 이미지 — ${scoreHeadline(summary)}`}
          style={{ width: '100%', maxWidth: 600, borderRadius: 12, marginTop: 20 }}
        />
        <p style={{ marginTop: 16 }}>
          <a href={shareUrl} download={`solutionarchive-quiz-${summary.score}of${summary.question_count}.png`}>
            공유 이미지 내려받기
          </a>
        </p>
      </main>
    )
  }

  if (!questions) {
    return (
      <main style={wrap}>
        <p>문제를 불러오는 중…</p>
      </main>
    )
  }

  if (submitting) {
    return (
      <main style={wrap}>
        <p>채점 중…</p>
      </main>
    )
  }

  const q = questions[cursor]
  return (
    <main style={wrap}>
      <p style={{ color: '#71717a', fontSize: 14, margin: 0 }}>
        {cursor + 1} / {questions.length}
        {q.category ? ` · ${q.category}` : ''}
      </p>
      <h1 style={{ fontSize: 22, marginTop: 8 }}>이 두 소구점 중 뭐가 더 반응 좋았을까요?</h1>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 24 }}>
        {q.options.map((opt) => (
          <button key={opt.side} type="button" style={CARD} onClick={() => choose(q, opt.side)}>
            {opt.text}
          </button>
        ))}
      </div>
    </main>
  )
}
