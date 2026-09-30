import { PubButtonLink } from './Button'
import { PubIconTile } from './PubIconTile'
import { IconApprove } from '../icons'

/**
 * 잠긴 자리 한 줄(I0, reports/2026-09-30/design-direction-ia-insights-report.md) — 로그인전 화면이 잘라낸 자리에
 * **건수만** 둔다. 브랜드·요약·슬러그는 싣지 않는다(잘린 데이터는 부모가 서버에서 이미 뺐다).
 * `.pub-index` 목록 안의 `<li>` 다. 링크 줄이 아니고, 누를 곳은 오른쪽 "로그인" 하나뿐이다.
 */
export function PubLockRow({ count, unit, what, next }: {
  /** null = 못 셌다(0 과 섞지 않는다, §7.1). */
  count: number | null
  unit: string
  what: string
  /** 로그인 뒤 돌아올 경로. */
  next: string
}) {
  return (
    <li className="pub-index-lock">
      <PubIconTile icon={<IconApprove />} tone="lilac" size={32} />
      <span className="pub-index-lock-t">
        {count === null ? `${what}: 건수 집계 불가. 로그인 후 볼 수 있다` : `${what} ${count}${unit}은 로그인 후 볼 수 있다`}
      </span>
      <PubButtonLink href={`/login?next=${encodeURIComponent(next)}`} variant="outline" size="sm">로그인</PubButtonLink>
    </li>
  )
}
