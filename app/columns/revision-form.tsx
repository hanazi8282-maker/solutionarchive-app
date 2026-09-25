'use client'

import { useActionState } from 'react'
import { decideRevision, type ReviewActionState } from './actions'
import { Button } from '../_ds/components/Button'
import { Notice } from '../_ds/components/Shell'

/** 수정본 재승인 — 채택(본문을 수정본으로) / 원문 유지. 발행 승인은 DecisionForm 이 따로 한다. */
export function RevisionForm({ id }: { id: string }) {
  const [state, action, pending] = useActionState<ReviewActionState, FormData>(decideRevision, null)
  return (
    <form action={action} className="v2-form v2-mt-sm">
      <input type="hidden" name="id" value={id} />
      <div className="v2-actions">
        <Button type="submit" name="decision" value="approved" variant="primary" size="sm" disabled={pending}>수정본 채택</Button>
        <Button type="submit" name="decision" value="rejected" variant="ghost" size="sm" disabled={pending}>원문 유지</Button>
        {pending && <span className="v2-note">저장 중…</span>}
      </div>
      {state && <Notice tone={state.ok ? 'success' : 'danger'}>{state.message}</Notice>}
    </form>
  )
}
