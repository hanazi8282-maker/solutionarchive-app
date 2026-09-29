'use client'

import { useState, type ReactNode } from 'react'
import { DecisionForm } from './decision-form'

// 승인 버튼은 본문을 한 번이라도 펼쳐야 눌린다(남헌 2026-09-29 지시) — 본문을 안 열어도
// 승인이 눌리는 게 실제 사고였다. <details> 는 이 컴포넌트가 직접 그린다: onToggle 로
// "열렸다"를 한 번 기록하면 다시 닫아도 풀리지 않는다(다시 펼쳐 확인할 의무까지는 아니다).
// 이 상태는 DecisionForm 에도 넘어가 히든 필드로 폼에 실리고, actions.ts 가 서버에서도 본다(§10.1 최소 방어).
export function ColumnReviewGate({ id, body, children }: { id: string; body: string; children?: ReactNode }) {
  const [opened, setOpened] = useState(false)

  return (
    <>
      <details onToggle={(e) => { if (e.currentTarget.open) setOpened(true) }}>
        <summary className="v2-summary v2-nosel">
          본문 펼쳐서 읽기 (근거 메모·자체 점검 포함, 원문 그대로)
        </summary>
        <pre className="v2-inset v2-pre v2-mt-sm">{body}</pre>
      </details>
      {children}
      <DecisionForm id={id} bodyOpened={opened} />
    </>
  )
}
