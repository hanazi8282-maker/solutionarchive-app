'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { IconChevronDown, IconExternal } from '../icons'

/**
 * "관리자 전환" 드롭다운 — 로그인 상태에서 `PubNav` 오른쪽 끝(남헌 2026-09-30 IA 재편).
 * 좌측 사이드바(`_ds/AppNav`, 삭제)의 목적지를 그룹형 패널 하나로 옮겼다.
 *
 * ⚠️ 화면 전환 UI 일 뿐 권한 분기가 아니다. 접근 차단은 `proxy.ts` 와 서버 액션 가드가 한다.
 *
 * 패턴은 disclosure(버튼 + 링크 목록)다 — role="menu" 가 아니다. 항목이 전부 일반 링크라
 * 스크린리더가 링크로 읽는 편이 맞다. 키보드: 클릭/Enter 로 열림 · 열리면 첫 링크로 포커스 ·
 * ↑↓ Home End 이동 · Tab 자연 순서(패널 밖으로 나가면 닫힘) · Esc 닫고 트리거로 복귀 · 바깥 클릭 닫힘.
 */
type Item = { href: string; match: string; label: string }

const GROUPS: readonly { label: string; items: readonly Item[] }[] = [
  {
    label: '정보 수집 현황',
    items: [
      { href: '/agents', match: '/agents', label: '에이전트 현황' },
      // 야간 발굴 루프가 스스로 고른 후보를 사람이 뒤집는 자리. 여기 없으면 자동 채택이 그대로 굳는다.
      { href: '/discovery', match: '/discovery', label: '브랜드 후보 발굴' },
    ],
  },
  {
    label: 'PMF 분석',
    items: [
      { href: '/analyze', match: '/analyze', label: '소구점 분석' },
      // 관련성 판정 기준을 사람이 채점해 되먹이는 자리(요약은 /relevance/feedback).
      { href: '/relevance/grade', match: '/relevance', label: 'VOC 분석' },
    ],
  },
  {
    label: '검수·운영',
    items: [{ href: '/cases', match: '/cases', label: '케이스 검수' }],
  },
  {
    label: '칼럼&SNS',
    items: [
      { href: '/columns', match: '/columns', label: '칼럼·스레드 검수' },
      { href: '/dashboard', match: '/dashboard', label: '발행 연결 수리' },
    ],
  },
]

// 계정 쪽 — 사이드바 하단에 있던 것. 없애면 로그아웃·프로필로 가는 길이 사라진다.
const PROFILE: Item = { href: '/settings/profile', match: '/settings', label: '내 프로필' }
// claude.ai 아티팩트라 작성자 계정으로 로그인해야 열린다.
const MANUAL_URL = 'https://claude.ai/code/artifact/775a2ae2-108f-4664-b093-4f9f3e8bb437'

/** 공개 화면(`/cases/report`·`/columns/read`)은 이 메뉴의 목적지가 아니다 — 거기서 켜지지 않게 뺀다. */
function activeItem(path: string): Item | undefined {
  if (path.startsWith('/cases/report') || path.startsWith('/columns/read')) return undefined
  return [...GROUPS.flatMap((g) => g.items), PROFILE]
    .filter((i) => path === i.match || path.startsWith(i.match + '/'))
    .sort((a, b) => b.match.length - a.match.length)[0]
}

export function AdminMenu({ email }: { email: string }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const active = activeItem(usePathname() ?? '')

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

  const close = () => setOpen(false)

  return (
    <div
      ref={rootRef}
      className="pub-admin"
      onKeyDown={onKeyDown}
      // Tab 으로 패널 밖에 나가면 닫는다 — 열린 패널이 다음 요소를 덮고 남지 않게.
      onBlur={(e) => { if (open && !rootRef.current?.contains(e.relatedTarget as Node)) setOpen(false) }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="pub-btn pub-admin-trigger"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
      >
        관리자 전환
        <IconChevronDown className="pub-admin-chev" />
      </button>
      <div ref={panelRef} id={panelId} className="pub-admin-panel" hidden={!open}>
        {GROUPS.map((g) => (
          <div key={g.label} className="pub-admin-group">
            <p className="pub-admin-h" id={`${panelId}-${g.label}`}>{g.label}</p>
            <ul aria-labelledby={`${panelId}-${g.label}`}>
              {g.items.map((i) => (
                <li key={i.href}>
                  <Link className="pub-admin-link" href={i.href} aria-current={i === active ? 'page' : undefined} onClick={close}>
                    {i.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="pub-admin-account">
          <p className="pub-admin-email" title={email} translate="no">{email}</p>
          <Link className="pub-admin-link" href={PROFILE.href} aria-current={PROFILE === active ? 'page' : undefined} onClick={close}>
            {PROFILE.label}
          </Link>
          <a className="pub-admin-link" href={MANUAL_URL} target="_blank" rel="noreferrer">
            사용설명서 <IconExternal /><span className="pub-sr">(새 탭)</span>
          </a>
          <form action="/auth/logout" method="post">
            <button type="submit" className="pub-admin-link">로그아웃</button>
          </form>
        </div>
      </div>
    </div>
  )
}
