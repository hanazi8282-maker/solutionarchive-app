import type { CSSProperties } from 'react'
import type { ActionState } from './actions'

/** 폼 3개가 공유하는 프레젠테이션 조각. 로직 없음. */

/** 2열 그리드. 좁은 화면에서는 자동으로 1열이 된다. */
export const formGrid: CSSProperties = {
  display: 'grid',
  // min(100%, …) 가 없으면 컨테이너가 최소폭보다 좁을 때 가로 스크롤이 생긴다.
  gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 320px), 1fr))',
  gap: 16,
  alignItems: 'start',
}

/** 그리드에서 한 줄 전체를 차지한다. */
export const span2: CSSProperties = { gridColumn: '1 / -1' }

/** 서버 액션 결과 배너 — 성공/실패를 색으로 가른다. */
export function ResultMessage({ state, style }: { state: NonNullable<ActionState>; style?: CSSProperties }) {
  const ok = state.ok
  return (
    <p
      role="status"
      style={{
        margin: 0,
        padding: '10px 12px',
        borderRadius: 'var(--radius-md)',
        fontSize: 13,
        lineHeight: 1.55,
        overflowWrap: 'anywhere',
        background: ok ? 'var(--success-bg)' : 'var(--danger-bg)',
        border: `1px solid ${ok ? 'var(--success-border)' : 'var(--danger-border)'}`,
        color: ok ? 'var(--success-fg)' : 'var(--danger-fg)',
        ...style,
      }}
    >
      {state.message}
    </p>
  )
}
