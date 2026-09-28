'use client'

import { useActionState, useState, type FormEvent } from 'react'
import { deleteCase, restoreCase, type ReviewActionState } from './actions'
import { Button } from '../_ds/components/Button'
import { Textarea } from '../_ds/components/Field'
import { Notice } from '../_ds/components/Shell'

// 공개에서 내리기(숨김)·복원. 반려와 별개 축이다 — 검수 상태는 그대로 두고 공개 화면·검색·어드바이저·퀴즈·
// 앵글 선택에서만 뺀다(lib/cases/deleted.ts). 누를 수 있는 사람 = 로그인 허용목록 전원(역할 구분 없음, CLAUDE.md §5-1).

export function CaseDeleteForm({ id, brand, deletedAt, deletedBy, reason, available }: {
  id: string
  brand: string
  deletedAt: string | null
  deletedBy: string | null
  reason: string | null
  /** 행에 deleted_at 컬럼이 실려 왔나. false = 마이그 미적용 — 버튼을 잠근다. */
  available: boolean
}) {
  const [text, setText] = useState('')
  const [state, action, pending] = useActionState<ReviewActionState, FormData>(deletedAt ? restoreCase : deleteCase, null)
  const confirmOr = (msg: string) => (e: FormEvent) => { if (!window.confirm(msg)) e.preventDefault() }

  if (!available) {
    return <p className="v2-note">공개에서 내리기 — 마이그 20260930000030(case_soft_delete) 미적용이라 아직 쓸 수 없다.</p>
  }

  return deletedAt ? (
    <form action={action} onSubmit={confirmOr(`${brand} 을(를) 복원할까요? 승인 상태면 공개 화면에 바로 다시 보입니다.`)} className="v2-form">
      <input type="hidden" name="id" value={id} />
      <p className="v2-note v2-flag">
        공개에서 내림(숨김) — {deletedAt.slice(0, 16).replace('T', ' ')} UTC · {deletedBy ?? '미기재'} · 사유 {reason ?? '미기재'}
      </p>
      <div className="v2-actions">
        <Button type="submit" variant="outline" size="sm" disabled={pending}>복원</Button>
        {pending && <span className="v2-note">저장 중…</span>}
      </div>
      {state && <Notice tone={state.ok ? 'success' : 'danger'}>{state.message}</Notice>}
    </form>
  ) : (
    <form action={action} onSubmit={confirmOr(`${brand} 을(를) 공개에서 내릴까요? 라이브러리·검색·어드바이저·퀴즈에서 즉시 빠집니다. 복원할 수 있습니다.`)} className="v2-form">
      <input type="hidden" name="id" value={id} />
      <Textarea
        name="reason"
        rows={2}
        required
        maxLength={500}
        value={text}
        onChange={(e) => setText(e.target.value)}
        aria-label={`${brand} 공개에서 내리는 사유`}
        placeholder="내리는 사유 (필수) — 예: 자동 승인 오판, 근거 링크 깨짐"
      />
      <div className="v2-actions">
        <Button type="submit" variant="destructive" size="sm" className="v2-btn-danger" disabled={pending || !text.trim()}>
          공개에서 내리기(숨김)
        </Button>
        {pending && <span className="v2-note">저장 중…</span>}
      </div>
      {state && <Notice tone={state.ok ? 'success' : 'danger'}>{state.message}</Notice>}
    </form>
  )
}
