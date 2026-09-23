'use client'

import { useActionState } from 'react'
import { toggleSave, type SaveState } from './save-actions'
import { Button, ButtonLink } from '../../_ds/components/Button'

/**
 * 저장(북마크) 토글. 히어로 액션 줄에서 링크 복사 버튼 옆에 앉는다.
 *
 * 3상태를 다 다르게 말한다(§7.1):
 *   로그인 O + 테이블 O — "저장" / "저장됨" 토글
 *   로그인 X          — 버튼 대신 로그인 링크. 숨기지 않는다 — 저장할 수 있는 곳이라는
 *                       사실 자체가 정보고, 눌렀을 때 왜 안 되는지 알려 주는 게 낫다.
 *   테이블 X(마이그 미적용) — 버튼을 **비활성**으로 두고 사유를 적는다. 눌러서 실패하게
 *                       두면 "저장 실패"가 내 계정 문제처럼 읽힌다.
 *
 * `initialSaved` 는 서버가 읽어 넘긴 값이다. 누르기 전까지는 그 값이 화면의 진실이고,
 * 누른 뒤에는 액션이 돌려준 `saved` 가 이긴다(액션이 DB 를 다시 읽고 뒤집는다).
 */
export function SaveButton({ caseStudyId, slug, signedIn, initialSaved, unavailable }: {
  caseStudyId: string
  slug: string
  signedIn: boolean
  initialSaved: boolean
  /** 마이그 미적용·조회 실패 사유. 있으면 토글을 켜지 않는다. */
  unavailable?: string | null
}) {
  const [state, action, pending] = useActionState<SaveState, FormData>(toggleSave, null)
  const saved = state?.saved ?? initialSaved

  if (!signedIn) {
    return (
      <ButtonLink href={`/login?next=${encodeURIComponent(`/library/${slug}`)}`} variant="outline" size="sm">
        로그인하면 저장할 수 있다
      </ButtonLink>
    )
  }

  if (unavailable) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <Button variant="outline" size="sm" disabled>저장</Button>
        <span role="status" style={{ fontSize: 12, color: 'var(--warning-fg)' }}>{unavailable}</span>
      </span>
    )
  }

  return (
    <form action={action} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <input type="hidden" name="case_study_id" value={caseStudyId} />
      <Button type="submit" variant={saved ? 'primary' : 'outline'} size="sm" aria-pressed={saved} disabled={pending}>
        {pending ? '…' : saved ? '저장됨' : '저장'}
      </Button>
      {state && (
        <span
          role={state.ok ? 'status' : 'alert'}
          style={{ fontSize: 12, color: state.ok ? 'var(--success-fg)' : 'var(--warning-fg)' }}
        >
          {state.message}
        </span>
      )}
    </form>
  )
}
