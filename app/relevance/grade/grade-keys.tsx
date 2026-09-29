'use client'

import { useEffect } from 'react'

/**
 * 단축키 (DESIGN.md §4, 남헌 09-29 결정 f: U·K 유지).
 *   1/2/3 판정 · 4/5 정보성 · Enter 저장(카드 안, 메모 안에서는 Ctrl/⌘+Enter) · J 다음 · K 이전 · U 되돌리기.
 * 카드 안에 포커스가 있을 때만 카드 키가 산다. 저장 자체는 카드(relevance-card.tsx)가 한다 —
 * 여기서는 DOM 의 버튼·라디오를 누를 뿐이다. 키보드로 촉발한 액션은 html[data-kbd] 로 전환 0ms(sa.css).
 */
export function GradeKeys() {
  useEffect(() => {
    const html = document.documentElement
    const cards = () => [...document.querySelectorAll<HTMLElement>('[data-gcard]')]
    const go = (el: HTMLElement | undefined) => {
      if (!el) return
      el.scrollIntoView({ block: 'start', behavior: 'auto' })
      el.focus({ preventScroll: true })
    }
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      const tag = (t.tagName || '').toLowerCase()
      const typing = tag === 'textarea' || (tag === 'input' && (t as HTMLInputElement).type !== 'radio')
      const card = t.closest?.('[data-gcard]') as HTMLElement | null
      const open = card && card.dataset.gcard === 'open' ? card : null
      html.setAttribute('data-kbd', '')
      try {
        if (typing && tag === 'textarea' && e.key === 'Enter') {
          if ((e.ctrlKey || e.metaKey) && open) { open.querySelector<HTMLButtonElement>('[data-save]')?.click(); e.preventDefault() }
          return
        }
        if (typing || e.metaKey || e.ctrlKey || e.altKey) return
        const list = cards()
        const i = card ? list.indexOf(card) : -1
        if (e.key === 'j' || e.key === 'J') { go(list.slice(i + 1).find((c) => c.dataset.gcard === 'open') ?? list.find((c) => c.dataset.gcard === 'open')); e.preventDefault(); return }
        if (e.key === 'k' || e.key === 'K') { go(list[Math.max(0, i - 1)]); e.preventDefault(); return }
        if (e.key === 'u' || e.key === 'U') { document.querySelector<HTMLButtonElement>('[data-undo]')?.click(); e.preventDefault(); return }
        if (!open) return
        if (e.key >= '1' && e.key <= '3') {
          const r = open.querySelectorAll<HTMLInputElement>('input[name="verdict"]')[Number(e.key) - 1]
          if (r) { r.checked = true; r.focus({ preventScroll: true }) }
          e.preventDefault(); return
        }
        if (e.key === '4' || e.key === '5') {
          const r = open.querySelectorAll<HTMLInputElement>('input[name="informative"]')[Number(e.key) - 4]
          if (r) { r.checked = true; r.focus({ preventScroll: true }) }
          e.preventDefault(); return
        }
        if (e.key === 'Enter' && !t.closest('a, button, summary, details')) { open.querySelector<HTMLButtonElement>('[data-save]')?.click(); e.preventDefault() }
      } finally {
        setTimeout(() => html.removeAttribute('data-kbd'), 0)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
  return null
}
