'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { toggleSave, type SaveState } from './save-actions'

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
 *
 * ⚠️ 클라이언트 컴포넌트라 `_pub` 의 서버용 버튼을 못 쓴다 — `.pub-btn` 클래스를 직접 붙인다.
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
      <Link className="pub-btn pub-btn--ghost pub-btn--sm" href={`/login?next=${encodeURIComponent(`/library/${slug}`)}`}>
        로그인하면 저장할 수 있다
      </Link>
    )
  }

  if (unavailable) {
    return (
      <span className="pub-formrow">
        <button className="pub-btn pub-btn--ghost pub-btn--sm" type="button" disabled>저장</button>
        <span className="pub-caption" role="status">{unavailable}</span>
      </span>
    )
  }

  return (
    <form className="pub-formrow" action={action}>
      <input type="hidden" name="case_study_id" value={caseStudyId} />
      <button
        className={`pub-btn pub-btn--sm ${saved ? 'pub-btn--primary' : 'pub-btn--ghost'}`}
        type="submit"
        aria-pressed={saved}
        disabled={pending}
      >
        {pending ? '…' : saved ? '저장됨' : '저장'}
      </button>
      {state && <span className="pub-caption" role={state.ok ? 'status' : 'alert'}>{state.message}</span>}
    </form>
  )
}
