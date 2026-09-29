'use client'

import { useActionState, useState } from 'react'
import { decideColumn, type ReviewActionState } from './actions'
import { Button } from '../_ds/components/Button'
import { Textarea } from '../_ds/components/Field'
import { Notice } from '../_ds/components/Shell'

// 검수자는 폼에서 받지 않는다. 서버 액션이 로그인 세션의 이메일을 reviewed_by 에 쓴다(./actions.ts).

// bodyOpened — 본문 <details> 를 한 번이라도 편 적이 있는지(./review-gate.tsx). 승인 버튼은 그 전까지 잠근다
// (남헌 2026-09-29 지시: 안 펼쳐도 승인이 눌리는 게 사고였다). 히든 필드로 폼에 실어 서버(actions.ts)에서도 본다 —
// 클라이언트 값이라 값 조작에는 못 버티는 최소 방어다, 그래도 "무심코 클릭"은 막는다.
export function DecisionForm({ id, bodyOpened }: { id: string; bodyOpened: boolean }) {
  const [note, setNote] = useState('')
  const [state, action, pending] = useActionState<ReviewActionState, FormData>(decideColumn, null)

  return (
    <form action={action} className="v2-form">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="bodyOpened" value={bodyOpened ? '1' : ''} />
      <Textarea
        name="note"
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        aria-label="반려 사유 또는 승인 메모"
        placeholder="반려 사유 (반려 시 필수) · 승인 메모 (선택)"
      />
      <div className="v2-actions">
        {/* 누른 버튼의 name/value 가 FormData 의 decision 이 된다. 서버가 값을 다시 검증한다. */}
        <Button type="submit" name="decision" value="approved" variant="primary" size="sm" disabled={pending || !bodyOpened}>
          칼럼 승인
        </Button>
        <Button type="submit" name="decision" value="rejected" variant="destructive" size="sm" className="v2-btn-danger" disabled={pending || !note.trim()}>
          칼럼 반려
        </Button>
        {pending && <span className="v2-note">저장 중…</span>}
        {!bodyOpened && <span className="v2-note">본문을 펼쳐 읽어야 승인할 수 있다</span>}
        {bodyOpened && !note.trim() && <span className="v2-note">반려하려면 사유를 적는다</span>}
      </div>
      {state && <Notice tone={state.ok ? 'success' : 'danger'}>{state.message}</Notice>}
    </form>
  )
}
