'use client'

import { createContext, useActionState, useContext, useState, type ReactNode } from 'react'
import { decideCase, decideMove, type ReviewActionState } from './actions'
import { Button } from '../_ds/components/Button'
import { Field, Input, Textarea } from '../_ds/components/Field'
import { Notice } from '../_ds/components/Shell'

// 검수자 이름은 화면 맨 위에서 한 번 적고 모든 결정 폼이 같이 쓴다.
// 로그인이 붙기 전까지의 자리다 — 붙으면 서버 액션이 세션에서 읽는다.
const Reviewer = createContext('')

export function ReviewerScope({ children }: { children: ReactNode }) {
  const [name, setName] = useState('')
  return (
    <Reviewer.Provider value={name}>
      <Field
        label={<>검수자 이름<span style={{ color: 'var(--danger-fg)' }}> · 필수</span></>}
        htmlFor="reviewer"
        hint="승인·반려 기록에 남는다. 비어 있으면 결정 버튼이 잠긴다."
      >
        <Input id="reviewer" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" style={{ maxWidth: 240 }} />
      </Field>
      {children}
    </Reviewer.Provider>
  )
}

export function DecisionForm({ kind, id, locked, approveWarning }: {
  kind: 'move' | 'case'
  id: string
  /** 결정 자체를 막는 사유(마이그 미적용·확인 불가). 있으면 버튼이 전부 잠긴다. */
  locked: boolean
  /** 승인하면 따라오는 주의. 누르기 전에 보여준다. */
  approveWarning?: string | null
}) {
  const by = useContext(Reviewer)
  const [note, setNote] = useState('')
  const [state, action, pending] = useActionState<ReviewActionState, FormData>(kind === 'move' ? decideMove : decideCase, null)
  const noName = !by.trim()
  const off = pending || locked || noName
  const what = kind === 'move' ? '무브' : '케이스'

  return (
    <form action={action} style={{ display: 'grid', gap: 8 }}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="by" value={by} />
      <Textarea
        name="note"
        rows={2}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={locked}
        aria-label={`${what} 반려 사유 또는 승인 메모`}
        placeholder="반려 사유 (반려 시 필수) · 승인 메모 (선택)"
      />
      {approveWarning && (
        <p style={{ margin: 0, fontSize: 12, color: 'var(--warning-fg)', overflowWrap: 'anywhere' }}>승인 시 주의 — {approveWarning}</p>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        {/* 누른 버튼의 name/value 가 FormData 의 decision 이 된다. 서버가 값을 다시 검증한다. */}
        <Button type="submit" name="decision" value="approved" variant="primary" size="sm" disabled={off}>
          {what} 승인
        </Button>
        <Button type="submit" name="decision" value="rejected" variant="destructive" size="sm" disabled={off || !note.trim()}>
          {what} 반려
        </Button>
        {pending && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>저장 중…</span>}
        {!locked && noName && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>맨 위에 검수자 이름을 먼저 적는다</span>}
        {!locked && !noName && !note.trim() && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>반려하려면 사유를 적는다</span>}
      </div>
      {state && <Notice tone={state.ok ? 'success' : 'danger'}>{state.message}</Notice>}
    </form>
  )
}
