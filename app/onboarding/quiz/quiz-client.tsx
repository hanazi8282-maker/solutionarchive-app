'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  scoreHeadline,
  type QuizQuestion,
  type ScoreSummary,
  type Side,
} from '@/lib/onboarding/quiz'
import { Hero } from '../../_pub/components/Hero'
import { Panel } from '../../_pub/components/Panel'
import { PubButtonLink } from '../../_pub/components/Button'
import { PubChoice } from '../../_pub/components/PubChoice'
import { PubProgress } from '../../_pub/components/PubProgress'
import { Stat, StatRow } from '../../_pub/components/Stat'
import { IconArrowRight } from '../../_pub/icons'

// Stage 6 — 온보딩 "감 점수" 퀴즈. 화면만 `app/_pub` 로 옮겼다(2026-09-23 A3).
// **동작은 한 줄도 바뀌지 않았다**: 문제 조회(GET /api/onboarding/quiz?session_id=),
// 채점(POST 같은 경로), session_id 생성·localStorage 보관, 공유 이미지 경로,
// 마지막 문제에서 자동 제출까지 전부 종전과 같다.
//
// 익명으로 돈다. session_id 는 여기서 만들어 localStorage 에 보관한다 — 온보딩은
// 정의상 로그인 이전 경험이다. 로그인이 들어오면 서버가 user_id 를 채운다.
//
// 이 파일이 클라이언트인 이유: 선택지 onClick·fetch 가 필요하다. 껍데기(PubShell)는
// 서버 컴포넌트라 page.tsx 에 남겨 두고, 상태를 가진 안쪽만 여기로 내렸다.
// h1 은 상태마다 하나씩(Hero) — 동시에 두 개가 렌더되는 분기는 없다.

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

export function QuizClient() {
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
      <div className="pub-quiz">
        <Hero eyebrow="SOLUTION ARCHIVE · 온보딩" title="소구점 판정 감 점수" />
        <Panel
          tone="alert"
          titleAs="h2"
          title={questions ? '채점하지 못했습니다' : '퀴즈를 불러오지 못했습니다'}
        >
          <p className="pub-text">{error}</p>
          {/* 다시 불러오기는 문제를 못 받았을 때만 준다. 채점 실패 뒤 새로고침하면 고른 답이 사라진다. */}
          {questions ? null : (
            <div className="pub-actions">
              <button className="pub-btn pub-btn--ghost" type="button" onClick={() => window.location.reload()}>
                다시 불러오기
              </button>
            </div>
          )}
        </Panel>
      </div>
    )
  }

  if (summary) {
    const shareUrl = `/api/onboarding/quiz/share?score=${summary.score}&total=${summary.question_count}`
    return (
      <div className="pub-quiz">
        <Hero
          eyebrow="SOLUTION ARCHIVE · 온보딩"
          title="내 감 점수"
          lead={`${summary.question_count}문제 기준`}
        />

        {/* 캡션은 lib 의 scoreHeadline 문장을 그대로 얹는다 — 퍼센타일·응답자 유무 분기가
            그 함수에 있고, 화면이 다시 쓰지 않는다. */}
        <Panel>
          <div aria-live="polite">
            <StatRow>
              <Stat
                label="감 점수"
                value={`${summary.score}/${summary.question_count}`}
                caption={scoreHeadline(summary)}
              />
            </StatRow>
          </div>
        </Panel>

        {/* 점수만 보고 끝나면 퀴즈는 장난이 된다. 다음 한 걸음을 한 개만 크게 둔다. */}
        <div className="pub-actions">
          <PubButtonLink href="/analyze/new" variant="primary" size="lg">
            이제 내 상품으로 해보기<IconArrowRight />
          </PubButtonLink>
          <PubButtonLink href="/cases" variant="ghost" size="lg">
            먼저 남의 사례 구경하기
          </PubButtonLink>
        </div>

        {summary.percentile === null && summary.respondents !== null && (
          <Panel tone="alert" titleAs="h2" title="퍼센타일은 표본이 모이면 붙는다">
            <p className="pub-text">
              응답자가 30명을 넘으면 상위 몇 %인지도 같이 보여드립니다. 지금은 표본이 작아 퍼센타일을 계산하지 않습니다.
            </p>
          </Panel>
        )}
        {summary.respondents === null && (
          <Panel tone="alert" titleAs="h2" title="확인 불가 — 응답자 집계">
            <p className="pub-text">응답자 집계를 읽지 못했습니다 — 점수만 표시합니다.</p>
          </Panel>
        )}
        {logged === false && (
          <Panel tone="alert" titleAs="h2" title="응답 기록 실패">
            <p className="pub-text">이 응답은 집계에 반영되지 않습니다.</p>
          </Panel>
        )}

        <Panel titleAs="h2" title="공유 이미지">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="pub-share-img"
            src={shareUrl}
            alt={`감 점수 공유 이미지 — ${scoreHeadline(summary)}`}
          />
          {/* 위 CTA 가 이 화면의 주행동이라 내려받기는 보조로 내린다.
              download 속성이 필요해 PubButtonLink 대신 <a> 를 직접 쓴다. */}
          <div className="pub-actions">
            <a
              className="pub-btn pub-btn--ghost"
              href={shareUrl}
              download={`solutionarchive-quiz-${summary.score}of${summary.question_count}.png`}
            >
              공유 이미지 내려받기
            </a>
          </div>
        </Panel>
      </div>
    )
  }

  if (!questions || submitting) {
    return (
      <div className="pub-quiz">
        <Hero eyebrow="SOLUTION ARCHIVE · 온보딩" title="소구점 판정 감 점수" />
        <p className="pub-text" role="status">{submitting ? '채점 중…' : '문제를 불러오는 중…'}</p>
      </div>
    )
  }

  const q = questions[cursor]
  return (
    <div className="pub-quiz">
      <PubProgress
        value={cursor}
        max={questions.length}
        label={`${cursor + 1} / ${questions.length}${q.category ? ` · ${q.category}` : ''}`}
      />
      <Hero
        eyebrow="SOLUTION ARCHIVE · 온보딩"
        title="이 두 소구점 중 뭐가 더 반응 좋았을까요?"
        lead="하나를 고르면 바로 다음 문제로 넘어갑니다."
      />
      <div className="pub-grid">
        {q.options.map((opt, i) => (
          <PubChoice key={opt.side} eyebrow={`선택지 ${i === 0 ? 'A' : 'B'}`} onClick={() => choose(q, opt.side)}>
            {opt.text}
          </PubChoice>
        ))}
      </div>
    </div>
  )
}
