/**
 * 긴 글 본문 타이포. `lib/columns/markdown.ts` 의 `renderMarkdown()` 결과를 그대로 받는다.
 *
 * 렌더된 HTML 안쪽에는 클래스를 달 수 없어서(문자열이다) 부모 클래스 하나로 자식 태그를
 * 잡는다 — 규칙은 `pub.css` 의 `.pub-article` 묶음이다.
 *
 * ⚠️ `dangerouslySetInnerHTML` 이 안전한 근거는 이 컴포넌트가 아니라 `renderMarkdown` 이다:
 *    모든 텍스트를 이스케이프한 **뒤에만** 태그를 만들고, 그 보장을
 *    `scripts/columns-markdown-selftest.mjs` 가 지킨다. 여기서 또 무해화하지 않는다
 *    (두 겹이면 어느 쪽이 진짜 방어선인지 흐려진다).
 */
export function PubArticle({ html }: { html: string }) {
  return <div className="pub-article" dangerouslySetInnerHTML={{ __html: html }} />
}
