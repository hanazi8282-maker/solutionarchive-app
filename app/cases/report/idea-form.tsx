'use client'

import type { FormEvent, ReactNode } from 'react'
import { ideaCookieOf, ideaOf, reportPathOf } from '@/lib/cases/idea-handoff'

/**
 * 아이디어 한 줄 제출 폼 — 원문을 주소(URL)에 싣지 않는다(2026-10-12 앱 감사 A-3, lib/cases/idea-handoff.ts).
 * 제출하면 입력을 30분짜리 쿠키(경로 /cases/report)에 얹고 질의 없는 주소로 이동한다. 서버는 쿠키에서 읽는다.
 * 새 서버 엔드포인트·서버 액션이 없다(인증 경계 불변). 쿠키는 접근 로그·리퍼러에 찍히지 않는다.
 *
 * ⚠️ 입력칸에 name 을 달지 않는다(`data-idea` 로 찾는다). name 이 있으면 JS 가 안 도는 상황의 기본 제출(GET)이
 * 아이디어를 ?q= 로 실어 버린다 — name 이 없으면 그 경우에도 아무것도 안 실린다.
 */
export function IdeaForm({ kind, className, children }: { kind: string; className?: string; children: ReactNode }) {
  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const el = e.currentTarget.querySelector<HTMLInputElement>('[data-idea]')
    const q = ideaOf(el?.value)
    if (!q) return
    document.cookie = ideaCookieOf(q, window.location.protocol === 'https:')
    window.location.assign(reportPathOf(kind))
  }
  return <form className={className} onSubmit={onSubmit}>{children}</form>
}
