import type { ReactNode } from 'react'
import { PubShell } from '../_pub/components/PubShell'
import { Panel } from '../_pub/components/Panel'

// 초안 3종(개인정보 처리방침·이용약관·요금제 안내)의 공통 틀. 어디에서도 링크하지 않는다.
// lib/auth/policy.ts 의 공개 목록에 없으므로 로그인(허용목록) 전용이다. 공개 전환은 법률 검토 뒤 별도 결정.
export const draftMetadata = { robots: { index: false, follow: false } }

export function DraftShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <PubShell theme="light">
      <Panel tone="alert" title="초안 — 법률 검토 대기, 공개 금지">
        <p className="pub-text">이 화면은 로그인한 관리자만 열린다. 링크·사이트맵·공개 경로에 넣지 않는다.</p>
      </Panel>
      <h1>{title}</h1>
      {children}
    </PubShell>
  )
}
