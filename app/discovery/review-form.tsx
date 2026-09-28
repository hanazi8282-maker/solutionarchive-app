'use client'

import { useActionState, useState } from 'react'
import { decideCandidate, type ReviewActionState } from './actions'
import { Button } from '../_ds/components/Button'
import { Input } from '../_ds/components/Field'
import { Notice } from '../_ds/components/Shell'

// 판정자는 폼에서 받지 않는다 — 서버 액션이 로그인 세션으로 권한을 확인한다(./actions.ts).
//
// 버튼 옆 문구가 중요하다. "무효"가 표시만 바꾸는지 수집까지 멈추는지 사람이 알 수 없으면,
// 눌러 놓고 계속 수집되는 걸 몇 주 뒤에 발견한다.
//
// 무효화는 사유가 필수다(5자 이상 — 서버가 다시 검증한다). 사유는 다음 발굴의 제안 프롬프트에 반례로 들어간다.

const MIN_NOTE = 5

export function ReviewForm({ id, current, hasProject }: { id: string; current: string; hasProject: boolean }) {
  const [state, action, pending] = useActionState<ReviewActionState, FormData>(decideCandidate, null)
  const [note, setNote] = useState('')
  const noteOk = note.trim().length >= MIN_NOTE

  return (
    <form action={action} className="v2-form">
      <input type="hidden" name="id" value={id} />
      {current !== 'killed' && (
        <Input
          name="note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="무효화 사유 (예: 엔터프라이즈 영업 의존 — 1인 창업가가 못 따라 함)"
          aria-label="무효화 사유"
          maxLength={300}
        />
      )}
      <div className="v2-actions">
        {/* 누른 버튼의 name/value 가 FormData 의 decision 이 된다. 서버가 값을 다시 검증한다. */}
        <Button type="submit" name="decision" value="kept" variant="primary" size="sm" disabled={pending || current === 'kept'}>
          유지
        </Button>
        <Button type="submit" name="decision" value="killed" variant="destructive" size="sm" className="v2-btn-danger" disabled={pending || current === 'killed' || !noteOk}>
          무효화
        </Button>
        {pending && <span className="v2-note">저장 중…</span>}
        {current !== 'killed' && !noteOk && <span className="v2-note">무효화하려면 사유를 {MIN_NOTE}자 이상 적는다</span>}
      </div>
      <p className="v2-note">
        {hasProject
          ? '무효화하면 이 후보가 만든 수집 대상도 함께 멈춘다 (분석 프로젝트 행은 남는다). 되돌려도 수집은 자동으로 다시 켜지지 않는다.'
          : '채택되지 않은 후보라 수집 대상이 없다 — 표시만 남는다. 같은 이름이 다음 밤에 다시 제안되는 것을 막는 용도다.'}
      </p>
      {state && <Notice tone={state.ok ? 'success' : 'danger'}>{state.message}</Notice>}
    </form>
  )
}
