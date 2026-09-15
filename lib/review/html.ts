// HTML 조각 → 평문. 어댑터 셋이 공유한다(hackernews · naver · reddit).
//
// ⚠️ 원래 hackernews.ts 안에 있었다. 네이버 검색 API 가 `description` 에
//    질의어를 `<b>` 로 감싸 주고 `&amp;` 같은 엔티티를 그대로 보내며,
//    Reddit 도 `raw_json=1` 을 빠뜨리면 엔티티가 섞여 온다. 같은 정규식을
//    세 번 쓰면 한 곳만 고치는 순간 소스마다 본문 정제가 달라진다.
//
// hackernews.ts 는 이 모듈을 re-export 한다 — 기존 픽스처 테스트가
// `__internal.codePoint` 를 그대로 부르기 때문이다.

/** 코드포인트가 범위를 벗어나면 String.fromCodePoint 가 던진다. 버린다. */
export function codePoint(n: number): string {
  return Number.isInteger(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : ''
}

/**
 * HTML 조각을 평문으로.
 *
 * ⚠️ **태그를 먼저 지우고 엔티티를 나중에 푼다.** 순서를 바꾸면 사람이
 *    실제로 쓴 `&lt;div&gt;` 가 `<div>` 로 풀린 뒤 태그로 오인돼 삭제된다.
 *    코드 이야기가 오가는 게시판(HN·Reddit)이라 실제로 흔한 입력이다.
 *
 * ⚠️ `&amp;` 는 **맨 마지막**에 푼다. 먼저 풀면 `&amp;lt;` 가 `&lt;` 를 거쳐
 *    `<` 까지 이중 해제된다.
 *
 * 새 의존성을 넣지 않는다 — 이 정도는 정규식으로 충분하고, 파서는 순수
 * 함수여야 픽스처로 테스트할 수 있다.
 */
export function htmlStrip(html: string): string {
  return html
    // 문단 구분을 먼저 살린다. 안 하면 `끝<p>시작` 이 `끝시작` 으로 붙는다.
    .replace(/<\s*p\s*\/?\s*>/gi, '\n\n')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => codePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => codePoint(parseInt(d, 10)))
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
