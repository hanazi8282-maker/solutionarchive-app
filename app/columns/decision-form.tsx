'use client'

import { useActionState, useState } from 'react'
import { decideColumn, type ReviewActionState } from './actions'
import { Button } from '../_ds/components/Button'
import { Textarea } from '../_ds/components/Field'
import { Notice } from '../_ds/components/Shell'

// 검수자는 폼에서 받지 않는다. 서버 액션이 로그인 세션의 이메일을 reviewed_by 에 쓴다(./actions.ts).

export function DecisionForm({ id }: { id: string }) {
  const [note, setNote] = useState('')
  const [state, action, pending] = useActionState<ReviewActionState, FormData>(decideColumn, null)

  return (
    <form action={action} style={{ display: 'grid', gap: 8 }}>
      <input type="hidden" name="id" value={id} />
      <Textarea
        name="note"
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        aria-label="반려 사유 또는 승인 메모"
        placeholder="반려 사유 (반려 시 필수) · 승인 메모 (선택)"
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        {/* 누른 버튼의 name/value 가 FormData 의 decision 이 된다. 서버가 값을 다시 검증한다. */}
        <Button type="submit" name="decision" value="approved" variant="primary" size="sm" disabled={pending}>
          칼럼 승인
        </Button>
        <Button type="submit" name="decision" value="rejected" variant="destructive" size="sm" disabled={pending || !note.trim()}>
          칼럼 반려
        </Button>
        {pending && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>저장 중…</span>}
        {!note.trim() && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>반려하려면 사유를 적는다</span>}
      </div>
      {state && <Notice tone={state.ok ? 'success' : 'danger'}>{state.message}</Notice>}
    </form>
  )
}
