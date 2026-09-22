// OG 이미지(next/og)용 한글 폰트 로더. 퀴즈 공유 이미지에만 있던 것을 랜딩 OG 가 같이 쓰면서
// 한 곳으로 옮겼다 — 이 우회(아래)는 Google Fonts 응답 형식에 기댄 것이라 두 벌로 갈라지면
// 한쪽만 깨진 채로 오래 간다.

/**
 * Satori 는 woff2 를 못 읽는다. Google Fonts css2 를 User-Agent 없이 호출하면
 * truetype URL 을 돌려주는 점을 이용해 필요한 글자만 서브셋으로 받는다.
 * 실패하면 null — 폰트 없이 렌더한다(숫자는 보이고 한글은 깨진다). 이미지
 * 생성 자체를 실패시키지 않되, 실패를 조용히 넘기지도 않는다(로그).
 */
export async function loadKoreanFont(text: string, tag: string): Promise<ArrayBuffer | null> {
  try {
    const cssUrl =
      'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@700&text=' +
      encodeURIComponent(text)
    const css = await fetch(cssUrl, { cache: 'force-cache' }).then((r) =>
      r.ok ? r.text() : null,
    )
    if (!css) return null
    const url = css.match(/src:\s*url\(([^)]+)\)/)?.[1]
    if (!url) return null
    const res = await fetch(url, { cache: 'force-cache' })
    if (!res.ok) return null
    return await res.arrayBuffer()
  } catch (e) {
    console.error(`[${tag}] font load failed:`, (e as Error).message)
    return null
  }
}
