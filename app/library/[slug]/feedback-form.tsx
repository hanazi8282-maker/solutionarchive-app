'use client'

import { useActionState, useState } from 'react'
import { submitCaseFeedback, type FeedbackState } from './actions'
import { FEEDBACK_NOTE_MAX } from '@/lib/cases/detail'
import { Button } from '../../_ds/components/Button'
import { Notice } from '../../_ds/components/Shell'

/**
 * 👍/👎 + 한 줄 (레퍼런스 계획 §3-8, IdeaBrowser "What'd you think of this idea?").
 *
 * 중복 방지를 하지 않는다 — 마음을 바꿔 다시 누른 것도 신호다(마이그레이션 주석의 ponytail).
 * 집계를 화면에 내지 않는다: 표가 몇 건인지 보여주면 뒤에 오는 사람이 그 숫자를 따라간다.
 *
 * 로그인 상태는 서버가 판정해 `signedIn` 으로 내려 준다. 로그인 전에도 버튼을 **그린다** —
 * 숨기면 "의견 낼 곳이 없는 페이지"로 보이고, 눌렀을 때 왜 안 되는지 알려 주는 게 낫다.
 */
export function FeedbackForm({ caseStudyId, signedIn }: { caseStudyId: string; signedIn: boolean }) {
  const [state, action, pending] = useActionState<FeedbackState, FormData>(submitCaseFeedback, null)
  const [vote, setVote] = useState<'1' | '-1' | ''>('')

  return (
    <form action={action} style={{ display: 'grid', gap: 10 }}>
      <input type="hidden" name="case_study_id" value={caseStudyId} />
      <input type="hidden" name="vote" value={vote} />

      <div role="group" aria-label="이 케이스가 도움이 됐나" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {([['1', '👍 옮길 게 있었다'], ['-1', '👎 가져갈 게 없었다']] as const).map(([v, label]) => (
          <Button
            key={v}
            type="button"
            variant={vote === v ? 'primary' : 'outline'}
            size="sm"
            aria-pressed={vote === v}
            onClick={() => setVote(v)}
          >
            {label}
          </Button>
        ))}
      </div>

      <input
        name="note"
        maxLength={FEEDBACK_NOTE_MAX}
        placeholder="한 줄 (선택) — 무엇이 도움이 됐나, 무엇이 빠졌나"
        aria-label="피드백 한 줄"
        style={{
          height: 36, padding: '0 10px', borderRadius: 'var(--radius-md)',
          border: '1px solid var(--border)', background: 'var(--surface-card)',
          color: 'var(--text-body)', fontSize: 13,
        }}
      />

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        <Button type="submit" variant="neutral" size="sm" disabled={pending || !vote}>
          {pending ? '보내는 중…' : '보내기'}
        </Button>
        {!signedIn && (
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            지금은 로그인한 사용자만 저장됩니다 · <a href="/login">로그인</a>
          </span>
        )}
      </div>

      {state && (
        <Notice tone={state.ok ? 'success' : 'danger'}>{state.message}</Notice>
      )}
    </form>
  )
}
