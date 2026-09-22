// 칼럼 본문(마크다운) → HTML. 순수 함수 2개뿐이고 import 가 없다 —
// scripts/columns-markdown-selftest.mjs 가 node 로 바로 불러 검사한다(auth-selftest 와 같은 방식).
//
// 파서를 직접 쓰는 이유: package.json 의존성 5개를 늘리지 않는다(CLAUDE.md §2, 리포 규약).
// 지원하는 문법은 칼럼이 실제로 쓰는 것만 — 제목(#·##·###)·문단·굵게·목록·인용·링크.
// 표·이미지·코드펜스·중첩목록은 지원하지 않는다(쓰이면 그냥 글자로 나온다).
//
// ⚠️ 본문은 신뢰할 수 없는 텍스트로 취급한다. 모든 텍스트를 먼저 이스케이프한 뒤에만
// 마크다운 치환을 얹는다 — 순서가 바뀌면 <script> 가 태그로 살아난다.

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ESCAPES[c])
}

/** 한 줄을 이스케이프한 뒤 인라인 문법(링크·굵게)을 얹는다. 치환은 반드시 이스케이프 다음이다. */
function inline(raw: string): string {
  let out = escapeHtml(raw)
  out = out.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (whole, text: string, href: string) => {
    // 스킴 화이트리스트 — javascript:·data: 는 링크로 만들지 않고 글자 그대로 남긴다(XSS).
    if (!/^(https?:\/\/|\/|#)/i.test(href)) return whole
    const external = /^https?:/i.test(href)
    return `<a href="${href}"${external ? ' target="_blank" rel="noopener noreferrer"' : ''}>${text}</a>`
  })
  return out.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
}

export function renderMarkdown(src: string): string {
  const out: string[] = []
  let para: string[] = []
  let items: string[] = []
  let quote: string[] = []

  const flushPara = () => { if (para.length) { out.push(`<p>${para.join(' ')}</p>`); para = [] } }
  const flushItems = () => { if (items.length) { out.push(`<ul>${items.join('')}</ul>`); items = [] } }
  const flushQuote = () => { if (quote.length) { out.push(`<blockquote>${quote.join(' ')}</blockquote>`); quote = [] } }
  const flushAll = () => { flushPara(); flushItems(); flushQuote() }

  for (const line of src.replace(/\r\n?/g, '\n').split('\n')) {
    const t = line.trim()
    if (!t) { flushAll(); continue }

    const heading = t.match(/^(#{1,3})\s+(.+)$/)
    if (heading) { flushAll(); out.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`); continue }

    const item = t.match(/^[-*]\s+(.+)$/)
    if (item) { flushPara(); flushQuote(); items.push(`<li>${inline(item[1])}</li>`); continue }

    const q = t.match(/^>\s?(.*)$/)
    if (q) { flushPara(); flushItems(); quote.push(inline(q[1])); continue }

    flushItems(); flushQuote(); para.push(inline(t))
  }
  flushAll()
  return out.join('\n')
}

/**
 * 적재된 원문(content_columns.body) → 공개 화면에 내보낼 부분만.
 *
 * 원문에는 공개하지 않는 것이 세 가지 섞여 있다(케이스-작성-가이드 규약):
 *   1. 첫머리 `독자:` / `판단 이유:` 메타 줄 — 편집용 분류
 *   2. `# 제목` 줄 — 화면이 title 컬럼으로 따로 그린다
 *   3. `---` 아래 `## 근거 메모` · `## 자체 점검` — 검수용 내부 메모
 * summary 는 첫 문단 앞부분(OG 이미지·목록 한 줄 요약용). 마크다운 기호는 털어 낸다.
 */
export function columnReadable(body: string, summaryChars = 80): { summary: string; markdown: string } {
  const [head] = body.replace(/\r\n?/g, '\n').split(/\n---\n/)
  const markdown = head
    .split('\n')
    .filter((l) => !/^(독자|판단 이유|case_slug)\s*:/.test(l.trim()) && !/^#\s+/.test(l.trim()))
    .join('\n')
    .trim()

  const first = markdown.split(/\n\s*\n/).map((s) => s.trim()).find((s) => s && !/^[#>\-*]/.test(s)) ?? ''
  const plain = first.replace(/\[([^\]\n]+)\]\([^)\s]+\)/g, '$1').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim()
  const summary = [...plain].length > summaryChars ? `${[...plain].slice(0, summaryChars).join('')}…` : plain
  return { summary, markdown }
}
