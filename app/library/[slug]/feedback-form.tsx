'use client'

import { useActionState, useState } from 'react'
import { submitCaseFeedback, type FeedbackState } from './actions'
import { FEEDBACK_NOTE_MAX } from '@/lib/cases/detail'

/**
 * 👍/👎 + 한 줄 (레퍼런스 계획 §3-8, IdeaBrowser "What'd you think of this idea?").
 *
 * **로그인 없이 낼 수 있다** — 남헌 2026-09-23 명시 승인: 익명 피드백 허용, 하루 1회 제한.
 * 그래서 "로그인해야 저장됩니다" 문구가 없다. 제한(IP 해시 + 쿠키, KST 하루 1회)은 서버
 * 액션이 세고, 걸리면 그 문장을 그대로 띄운다. 로그인돼 있으면 이메일도 함께 저장되지만
 * 그건 화면에서 달라지는 것이 없다(제한도 같다).
 *
 * 집계를 화면에 내지 않는다: 표가 몇 건인지 보여주면 뒤에 오는 사람이 그 숫자를 따라간다.
 *
 * ⚠️ 클라이언트 컴포넌트라 `_pub` 의 `PubButton`(서버용, onClick 없음)을 쓸 수 없다 —
 *    `pub.css` 의 `.pub-btn` 클래스를 직접 붙인다. A2 이관 뒤에도 동작은 그대로다.
 */
export function FeedbackForm({ caseStudyId }: { caseStudyId: string }) {
  const [state, action, pending] = useActionState<FeedbackState, FormData>(submitCaseFeedback, null)
  const [vote, setVote] = useState<'1' | '-1' | ''>('')

  return (
    <form className="pub-form" action={action}>
      <input type="hidden" name="case_study_id" value={caseStudyId} />
      <input type="hidden" name="vote" value={vote} />

      <div className="pub-formrow" role="group" aria-label="이 케이스가 도움이 됐나">
        {([['1', '👍 옮길 게 있었다'], ['-1', '👎 가져갈 게 없었다']] as const).map(([v, label]) => (
          <button
            key={v}
            type="button"
            className={`pub-btn pub-btn--sm ${vote === v ? 'pub-btn--primary' : 'pub-btn--ghost'}`}
            aria-pressed={vote === v}
            onClick={() => setVote(v)}
          >
            {label}
          </button>
        ))}
      </div>

      <input
        className="pub-field"
        name="note"
        maxLength={FEEDBACK_NOTE_MAX}
        placeholder="한 줄 (선택) — 무엇이 도움이 됐나, 무엇이 빠졌나"
        aria-label="피드백 한 줄"
      />

      <div className="pub-formrow">
        <button className="pub-btn pub-btn--primary pub-btn--sm" type="submit" disabled={pending || !vote}>
          {pending ? '보내는 중…' : '보내기'}
        </button>
        <span className="pub-caption">로그인 없이 남길 수 있습니다 · 케이스 1건당 하루 1번</span>
      </div>

      {state && (
        <p className="pub-caption" role={state.ok ? 'status' : 'alert'}>{state.message}</p>
      )}
    </form>
  )
}
