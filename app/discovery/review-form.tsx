'use client'

import { useActionState } from 'react'
import { decideCandidate, type ReviewActionState } from './actions'
import { Button } from '../_ds/components/Button'
import { Notice } from '../_ds/components/Shell'

// 판정자는 폼에서 받지 않는다 — 서버 액션이 로그인 세션으로 권한을 확인한다(./actions.ts).
//
// 버튼 옆 문구가 중요하다. "무효"가 표시만 바꾸는지 수집까지 멈추는지 사람이 알 수 없으면,
// 눌러 놓고 계속 수집되는 걸 몇 주 뒤에 발견한다.

export function ReviewForm({ id, current, hasProject }: { id: string; current: string; hasProject: boolean }) {
  const [state, action, pending] = useActionState<ReviewActionState, FormData>(decideCandidate, null)

  return (
    <form action={action} style={{ display: 'grid', gap: 6 }}>
      <input type="hidden" name="id" value={id} />
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
        {/* 누른 버튼의 name/value 가 FormData 의 decision 이 된다. 서버가 값을 다시 검증한다. */}
        <Button type="submit" name="decision" value="kept" variant="primary" size="sm" disabled={pending || current === 'kept'}>
          유지
        </Button>
        <Button type="submit" name="decision" value="killed" variant="destructive" size="sm" disabled={pending || current === 'killed'}>
          무효화
        </Button>
        {pending && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>저장 중…</span>}
      </div>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-muted)' }}>
        {hasProject
          ? '무효화하면 이 후보가 만든 수집 대상도 함께 멈춘다 (분석 프로젝트 행은 남는다). 되돌려도 수집은 자동으로 다시 켜지지 않는다.'
          : '채택되지 않은 후보라 수집 대상이 없다 — 표시만 남는다. 같은 이름이 다음 밤에 다시 제안되는 것을 막는 용도다.'}
      </p>
      {state && <Notice tone={state.ok ? 'success' : 'danger'}>{state.message}</Notice>}
    </form>
  )
}
