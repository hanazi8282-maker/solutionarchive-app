import type { ActionState } from './actions'
import { Notice } from '../_ds/components/Shell'

/** 폼 3개가 공유하는 프레젠테이션 조각. 로직 없음. */

// 2열 폼 그리드·한 줄 전체는 클래스다 — `.v2-formgrid` · `.v2-span2`(app/_ds/v2/v2.css).

/** 필수 입력 표시. 색만으로 전달하지 않도록 글자로 쓴다. */
export const REQUIRED = <span className="v2-req"> · 필수</span>

/** 서버 액션 결과 배너 — 공용 Notice 로 성공/실패를 가른다. */
export function ResultMessage({ state, className }: { state: NonNullable<ActionState>; className?: string }) {
  return (
    <div className={className}>
      <Notice tone={state.ok ? 'success' : 'danger'}>
        {state.message}
      </Notice>
    </div>
  )
}
