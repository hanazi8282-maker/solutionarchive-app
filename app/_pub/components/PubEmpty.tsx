import type { ReactNode } from 'react'

/**
 * 빈 상태 한 칸. **"0건"과 "못 읽었다"는 이 컴포넌트로 같이 쓰지 않는다** — 조회 실패는
 * `Panel tone="alert"` 로 따로 낸다(§7.1). 여기 나오는 문장은 항상 "조회는 정상이다"를
 * 전제로 한다. 그래서 `title` 에 그 사실을 적어 넘기는 것이 호출 쪽 규칙이다.
 *
 * 없는 것을 비슷한 것으로 채우지 않는다 — `action` 은 조건을 넓히는 링크이지 추천이 아니다.
 */
export function PubEmpty({ title, description, action, compact = false }: {
  title: string
  description?: string
  action?: ReactNode
  compact?: boolean
}) {
  return (
    <div className={compact ? 'pub-empty pub-empty--compact' : 'pub-empty'}>
      <p className="pub-empty-title">{title}</p>
      {description ? <p className="pub-empty-desc">{description}</p> : null}
      {action ? <div className="pub-chiprow">{action}</div> : null}
    </div>
  )
}
