'use client'

import { useActionState, useState } from 'react'
import { decideColumnPattern, type ReviewActionState } from './actions'
import { Button } from '../_ds/components/Button'
import { Textarea } from '../_ds/components/Field'
import { Notice } from '../_ds/components/Shell'

// 결정자는 폼에서 받지 않는다. 서버 액션이 로그인 세션의 이메일을 decided_by 에 쓴다(./actions.ts).
// "가이드에 반영함"은 사람이 문서를 고쳤다는 **기록**이다 — 이 버튼이 파일을 고치지 않는다.

export function PatternForm({ id }: { id: string }) {
  const [note, setNote] = useState('')
  const [state, action, pending] = useActionState<ReviewActionState, FormData>(decideColumnPattern, null)

  return (
    <form action={action} style={{ display: 'grid', gap: 8 }}>
      <input type="hidden" name="id" value={id} />
      <Textarea
        name="note"
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        aria-label="기각 사유 또는 반영 메모"
        placeholder="기각 사유 (기각 시 필수) · 반영 메모 (선택 — 가이드 어디에 넣었는지)"
      />
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        {/* 누른 버튼의 name/value 가 FormData 의 decision 이 된다. 서버가 값을 다시 검증한다. */}
        <Button type="submit" name="decision" value="applied" variant="primary" size="sm" disabled={pending}>
          가이드에 반영함
        </Button>
        <Button type="submit" name="decision" value="dismissed" variant="destructive" size="sm" disabled={pending || !note.trim()}>
          기각
        </Button>
        {pending && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>저장 중…</span>}
        {!note.trim() && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>기각하려면 사유를 적는다</span>}
      </div>
      {state && <Notice tone={state.ok ? 'success' : 'danger'}>{state.message}</Notice>}
    </form>
  )
}
