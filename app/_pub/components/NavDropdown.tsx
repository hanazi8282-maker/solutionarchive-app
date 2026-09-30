'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { IconChevronDown } from '../icons'

/**
 * 상단 nav 드롭다운 한 벌 — "관리자 전환"(`AdminMenu`)과 "아이디어 리소스"(`PubNav`)가 같이 쓴다(남헌 v9-2, 2026-10-01).
 * `AdminMenu`(#382)의 동작을 그대로 옮겼다.
 *
 * 패턴은 disclosure(버튼 + 링크 목록)다 — role="menu" 가 아니다. 항목이 전부 일반 링크라
 * 스크린리더가 링크로 읽는 편이 맞다. 키보드: 클릭/Enter 로 열림 · 열리면 첫 링크로 포커스 ·
 * ↑↓ Home End 이동 · Tab 자연 순서(패널 밖으로 나가면 닫힘) · Esc 닫고 트리거로 복귀 · 바깥 클릭 닫힘.
 * 패널 안 링크를 누르면 닫힌다.
 *
 * 둘이 동시에 열리지 않는 건 따로 조율하지 않아도 성립한다 — 다른 트리거를 누르면 그 pointerdown 이
 * 이쪽 "바깥 클릭"이고, 키보드로 옮겨 가면 이쪽 blur 가 먼저 닫는다.
 */
export function NavDropdown({
  label, className, triggerClassName, current, children,
}: {
  label: string
  /** 루트에 덧붙일 클래스(`.pub-admin` 규칙 위에 얹는 변형). */
  className?: string
  triggerClassName: string
  /** 트리거를 "현재 위치"로 칠할 경로 접두 — 패널 안 목적지 중 하나에 있으면 트리거에 `data-current`. */
  current?: readonly string[]
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const path = usePathname() ?? ''
  const here = current?.some((p) => path === p || path.startsWith(p + '/'))

  const focusables = () => [...(panelRef.current?.querySelectorAll<HTMLElement>('a[href], button') ?? [])]

  useEffect(() => {
    if (!open) return
    focusables()[0]?.focus()
    const onDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!open) return
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
      return
    }
    const list = focusables()
    const i = list.indexOf(document.activeElement as HTMLElement)
    const to =
      e.key === 'ArrowDown' ? list[(i + 1) % list.length]
      : e.key === 'ArrowUp' ? list[(i - 1 + list.length) % list.length]
      : e.key === 'Home' ? list[0]
      : e.key === 'End' ? list[list.length - 1]
      : undefined
    if (to) { e.preventDefault(); to.focus() }
  }

  return (
    <div
      ref={rootRef}
      className={className ? `pub-admin ${className}` : 'pub-admin'}
      onKeyDown={onKeyDown}
      // Tab 으로 패널 밖에 나가면 닫는다 — 열린 패널이 다음 요소를 덮고 남지 않게.
      onBlur={(e) => { if (open && !rootRef.current?.contains(e.relatedTarget as Node)) setOpen(false) }}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`${triggerClassName} pub-admin-trigger`}
        aria-expanded={open}
        aria-controls={panelId}
        data-current={here ? '' : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        {label}
        <IconChevronDown className="pub-admin-chev" />
      </button>
      <div
        ref={panelRef}
        id={panelId}
        className="pub-admin-panel"
        hidden={!open}
        onClick={(e) => { if ((e.target as Element).closest('a')) setOpen(false) }}
      >
        {children}
      </div>
    </div>
  )
}

/** nav 링크 한 개 — 지금 화면이 `href` 이거나 그 아래면 `aria-current="page"`. */
export function NavLink({ href, className, children }: { href: string; className: string; children: ReactNode }) {
  const path = usePathname() ?? ''
  const here = path === href || path.startsWith(href + '/')
  return <Link className={className} href={href} aria-current={here ? 'page' : undefined}>{children}</Link>
}
