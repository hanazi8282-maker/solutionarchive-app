'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  scoreHeadline,
  type QuizQuestion,
  type ScoreSummary,
  type Side,
} from '@/lib/onboarding/quiz'
import { Card } from '../../_ds/components/Card'
import { Button, ButtonLink } from '../../_ds/components/Button'
import { ProgressBar } from '../../_ds/components/ProgressBar'
import { Notice, PageHeader, PageShell, StatGrid, StatTile } from '../../_ds/components/Shell'

// Stage 6 — 온보딩 "감 점수" 퀴즈 화면.
//
// 익명으로 돈다. session_id 는 여기서 만들어 localStorage 에 보관한다 — 이
// 리포에 아직 인증이 없고(lib/supabase/server.ts 의 "TODO: Google SSO"), 온보딩은
// 정의상 로그인 이전 경험이다. 로그인이 들어오면 서버가 user_id 를 채운다.
//
// 표시만 디자인 시스템 토큰·컴포넌트로 바꿨다(전에는 zinc 하드코딩 색·기본 폰트).
// 상단 앱 네비는 AppNav 가 /onboarding 에서 스스로 숨는다.

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

const muted = { margin: 0, fontSize: 'var(--fs-sm)', lineHeight: 'var(--lh-normal)', color: 'var(--text-muted)' } as const

const OPTION: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 10,
  minHeight: 120,
  padding: '18px 20px',
  border: '1px solid var(--border-strong)',
  borderRadius: 'var(--radius-xl)',
  background: 'var(--surface-card)',
  boxShadow: 'var(--shadow-sm)',
  color: 'var(--text-strong)',
  textAlign: 'left',
  fontFamily: 'var(--font-sans)',
  fontSize: 16,
  lineHeight: 1.65,
  cursor: 'pointer',
  overflowWrap: 'anywhere',
}

function Brand() {
  return <div className="dgy-caps">SOLUTION ARCHIVE · 온보딩</div>
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
    // getSessionId() 는 localStorage 를 읽는다. 서버 렌더 시점에는 localStorage 가
    // 없으므로 useState 초기값으로 옮길 수 없고, 옮기면 하이드레이션이 어긋난다.
    // 마운트 후 한 번만 도는 의도된 추가 렌더다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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

  if (error) {
    return (
      <PageShell maxWidth={760}>
        <Brand />
        <PageHeader title="소구점 판정 감 점수" />
        <Notice
          tone="danger"
          title={questions ? '채점하지 못했습니다' : '퀴즈를 불러오지 못했습니다'}
          // 다시 불러오기는 문제를 못 받았을 때만 준다. 채점 실패 뒤 새로고침하면 고른 답이 사라진다.
          action={questions ? null : <Button variant="neutral" size="sm" onClick={() => window.location.reload()}>다시 불러오기</Button>}
        >
          {error}
        </Notice>
      </PageShell>
    )
  }

  if (summary) {
    const shareUrl = `/api/onboarding/quiz/share?score=${summary.score}&total=${summary.question_count}`
    return (
      <PageShell maxWidth={760}>
        <Brand />
        <PageHeader title="내 감 점수" subtitle={`${summary.question_count}문제 기준`} />

        {/* 다른 화면의 숫자와 같은 칸(StatTile)을 쓴다. 캡션은 lib 의 scoreHeadline 문장을
            그대로 얹는다 — 퍼센타일·응답자 유무 분기가 그 함수에 있고, 화면이 다시 쓰지 않는다. */}
        <div aria-live="polite">
          <StatGrid min={200}>
            <StatTile
              label="감 점수"
              value={`${summary.score}/${summary.question_count}`}
              caption={scoreHeadline(summary)}
            />
          </StatGrid>
        </div>

        {/* 점수만 보고 끝나면 퀴즈는 장난이 된다. 다음 한 걸음을 한 개만 크게 둔다. */}
        <div style={{ display: 'grid', gap: 10, justifyItems: 'center' }}>
          <ButtonLink href="/analyze/new" variant="primary" size="lg" fullWidth>
            이제 내 상품으로 해보기
          </ButtonLink>
          <a href="/cases" style={{ fontSize: 'var(--fs-sm)' }}>먼저 남의 사례 구경하기</a>
        </div>

        {summary.percentile === null && summary.respondents !== null && (
          <Notice tone="info">
            응답자가 30명을 넘으면 상위 몇 %인지도 같이 보여드립니다. 지금은 표본이 작아 퍼센타일을 계산하지 않습니다.
          </Notice>
        )}
        {summary.respondents === null && (
          <Notice tone="warning">응답자 집계를 읽지 못했습니다 — 점수만 표시합니다.</Notice>
        )}
        {logged === false && (
          <Notice tone="warning">응답 기록에는 실패했습니다(집계에 반영되지 않습니다).</Notice>
        )}

        <Card title="공유 이미지">
          <div style={{ display: 'grid', gap: 16, justifyItems: 'start' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={shareUrl}
              alt={`감 점수 공유 이미지 — ${scoreHeadline(summary)}`}
              style={{ width: '100%', maxWidth: 600, borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}
            />
            {/* 위 CTA 가 이 화면의 주행동이라 내려받기는 보조로 내린다. */}
            <ButtonLink
              href={shareUrl}
              variant="outline"
              download={`solutionarchive-quiz-${summary.score}of${summary.question_count}.png`}
            >
              공유 이미지 내려받기
            </ButtonLink>
          </div>
        </Card>
      </PageShell>
    )
  }

  if (!questions || submitting) {
    return (
      <PageShell maxWidth={760}>
        <Brand />
        <PageHeader title="소구점 판정 감 점수" />
        <p role="status" style={muted}>{submitting ? '채점 중…' : '문제를 불러오는 중…'}</p>
      </PageShell>
    )
  }

  const q = questions[cursor]
  return (
    <PageShell maxWidth={760}>
      <Brand />
      <div style={{ display: 'grid', gap: 8 }}>
        <p style={{ ...muted, fontVariantNumeric: 'tabular-nums' }}>
          {cursor + 1} / {questions.length}
          {q.category ? ` · ${q.category}` : ''}
        </p>
        <ProgressBar value={cursor} max={questions.length} tone="info" height={6} aria-hidden />
      </div>
      <PageHeader
        title="이 두 소구점 중 뭐가 더 반응 좋았을까요?"
        subtitle="하나를 고르면 바로 다음 문제로 넘어갑니다."
      />
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))' }}>
        {q.options.map((opt, i) => (
          <button key={opt.side} type="button" className="dgy-tile" style={OPTION} onClick={() => choose(q, opt.side)}>
            <span className="dgy-caps">선택지 {i === 0 ? 'A' : 'B'}</span>
            <span>{opt.text}</span>
          </button>
        ))}
      </div>
    </PageShell>
  )
}
