'use client'

import { useActionState, useState } from 'react'
import { decideCase, decideMove, type ReviewActionState } from './actions'
import { TRANSFERABILITY, TRANSFERABILITY_LABEL, TRANSFERABILITY_UNRATED_HINT } from '@/lib/cases/review'
import { Button } from '../_ds/components/Button'
import { Textarea } from '../_ds/components/Field'
import { Notice } from '../_ds/components/Shell'

// 검수자는 폼에서 받지 않는다. 서버 액션이 로그인 세션의 이메일을 reviewed_by 에 쓴다(./actions.ts).

export function DecisionForm({ kind, id, locked, approveWarning, transferabilityLocked }: {
  kind: 'move' | 'case'
  id: string
  /** 결정 자체를 막는 사유(마이그 미적용·확인 불가). 있으면 버튼이 전부 잠긴다. */
  locked: boolean
  /** 승인하면 따라오는 주의. 누르기 전에 보여준다. */
  approveWarning?: string | null
  /** 이식성 컬럼이 아직 DB 에 없다. 승인은 되지만 판정은 저장되지 않는다. */
  transferabilityLocked?: boolean
}) {
  const [note, setNote] = useState('')
  const [transfer, setTransfer] = useState('')
  const [state, action, pending] = useActionState<ReviewActionState, FormData>(kind === 'move' ? decideMove : decideCase, null)
  const off = pending || locked
  const what = kind === 'move' ? '무브' : '케이스'

  return (
    <form action={action} className="v2-form">
      <input type="hidden" name="id" value={id} />
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
        <p className="v2-note v2-flag">승인 시 주의 — {approveWarning}</p>
      )}
      {/* 이식성 — 승인 단위가 무브라 무브 폼에만 있다. **미선택도 승인된다.**
          판정을 필수로 걸면 검수가 더 밀린다. 미선택은 "낮음"이 아니라 "미판정"이다. */}
      {kind === 'move' && (
        <fieldset className="v2-fieldset v2-stack-tight">
          <legend className="v2-label v2-strong">이식성 — 이 무브를 독자가 자기 상황에 옮길 수 있나</legend>
          <div className="v2-actions">
            {TRANSFERABILITY.map((v) => (
              <label key={v} className="v2-radio">
                <input
                  type="radio"
                  name="transferability"
                  value={v}
                  checked={transfer === v}
                  disabled={locked || transferabilityLocked}
                  onChange={() => setTransfer(v)}
                />
                {TRANSFERABILITY_LABEL[v]}
              </label>
            ))}
          </div>
          <p className="v2-note">
            {transferabilityLocked
              ? '이식성 축 미적용(마이그 20260915000001) — 지금은 고를 수 없다. 승인은 그대로 된다.'
              : transfer ? '승인할 때 함께 저장됩니다.' : TRANSFERABILITY_UNRATED_HINT}
          </p>
        </fieldset>
      )}
      <div className="v2-actions">
        {/* 누른 버튼의 name/value 가 FormData 의 decision 이 된다. 서버가 값을 다시 검증한다. */}
        <Button type="submit" name="decision" value="approved" variant="primary" size="sm" disabled={off}>
          {what} 승인
        </Button>
        <Button type="submit" name="decision" value="rejected" variant="destructive" size="sm" className="v2-btn-danger" disabled={off || !note.trim()}>
          {what} 반려
        </Button>
        {pending && <span className="v2-note">저장 중…</span>}
        {!locked && !note.trim() && <span className="v2-note">반려하려면 사유를 적는다</span>}
      </div>
      {state && <Notice tone={state.ok ? 'success' : 'danger'}>{state.message}</Notice>}
    </form>
  )
}
