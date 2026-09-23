import type { ReactNode } from 'react'
import Link from 'next/link'

/**
 * 필터 칩 목록 — **한 벌을 두 모양으로** 쓴다: <1024px 상단 가로 스크롤 행, ≥1024px 좌측
 * 세로 sticky 목록. 어느 모양인지는 CSS 미디어쿼리(`pub.css` `.pub-facets`)가 정한다.
 * 두 벌로 렌더하면 칩 건수가 갈라진다 — JS 로 폭을 재지도 않는다(SSR 과 첫 페인트가 어긋난다).
 *
 * 필터는 전부 **링크**다(JS 0). 결과가 URL 에 다 있어 그대로 공유된다.
 * 선택 상태는 `aria-current="page"` 로도 말한다 — 색만으로 말하면 색을 못 보는 사람에게
 * 아무 말도 안 한 것이 된다.
 */
export function PubFacetBar({ label, children }: { label: string; children: ReactNode }) {
  return <aside className="pub-facets" aria-label={label}>{children}</aside>
}

export function PubFacet({ href, active, count, children }: {
  href: string
  active: boolean
  /** 건수. `undefined` 면 숫자 자리가 아예 안 나온다(0 과 "못 셌다"를 섞지 않는다 — §7.1). */
  count?: number
  children: ReactNode
}) {
  return (
    <Link className="pub-facet" href={href} aria-current={active ? 'page' : undefined}>
      {children}
      {count == null ? null : <span className="pub-facet-n">{count}</span>}
    </Link>
  )
}

/** 칩 묶음 사이 구분선. 가로 모양에서는 세로 선, 세로 모양에서는 가로 선이 된다(CSS). */
export function PubFacetSep() {
  return <span className="pub-facet-sep" aria-hidden />
}
