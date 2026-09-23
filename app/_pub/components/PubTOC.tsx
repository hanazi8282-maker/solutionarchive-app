/**
 * 상세 화면 목차. 항목은 `[앵커 id, 라벨]` 쌍이고, **JS 를 쓰지 않는다** — sticky 도
 * 가로 스크롤 칩도 CSS 만으로 된다(`pub.css` `.pub-toc`, ≥1024px 에서 오른쪽 sticky).
 *
 * DOM 순서는 [목차, 본문] 이다. 좁은 화면에서 목차가 위에 오는 게 맞고, 넓은 화면에서는
 * `grid-column` 으로 오른쪽에 앉힌다 — 순서를 바꾸려고 두 번 렌더하지 않는다.
 *
 * ⚠️ 부모가 `.pub-detail` 이어야 sticky 규칙이 먹는다(자식 선택자로 걸려 있다).
 */
export function PubTOC({ items }: { items: readonly (readonly [string, string])[] }) {
  return (
    <nav className="pub-toc" aria-label="이 페이지 목차">
      {items.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}
    </nav>
  )
}
