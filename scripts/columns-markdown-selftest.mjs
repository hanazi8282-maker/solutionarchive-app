#!/usr/bin/env node
// lib/columns/markdown.ts 셀프테스트 — 네트워크·DB 없음.
//   node scripts/columns-markdown-selftest.mjs
//
// 이 파서의 출력은 공개 읽기 화면에서 dangerouslySetInnerHTML 로 들어간다.
// 그래서 문법 케이스보다 **이스케이프 케이스가 본체**다 — 본문은 신뢰할 수 없는 텍스트로 본다.

import { renderMarkdown, columnReadable, escapeHtml } from '../lib/columns/markdown.ts'

let pass = 0
let fail = 0
const t = (name, cond, got) => {
  if (cond) pass++
  else { fail++; console.log(`❌ ${name}${got === undefined ? '' : `\n   실제: ${got}`}`) }
}

// ── 문법 ────────────────────────────────────────────────────────
t('1. 제목 3단계', renderMarkdown('# 하나\n\n## 둘\n\n### 셋') === '<h1>하나</h1>\n<h2>둘</h2>\n<h3>셋</h3>', renderMarkdown('# 하나\n\n## 둘\n\n### 셋'))
t('2. 빈 줄이 문단을 가른다', renderMarkdown('첫째 줄\n이어진 줄\n\n다음 문단') === '<p>첫째 줄 이어진 줄</p>\n<p>다음 문단</p>', renderMarkdown('첫째 줄\n이어진 줄\n\n다음 문단'))
t('3. 굵게', renderMarkdown('그는 **72만 달러**라고 밝혔다') === '<p>그는 <strong>72만 달러</strong>라고 밝혔다</p>')
t('4. 목록은 하나의 ul 로 묶인다', renderMarkdown('- 하나\n- 둘\n\n문단') === '<ul><li>하나</li><li>둘</li></ul>\n<p>문단</p>', renderMarkdown('- 하나\n- 둘\n\n문단'))
t('5. 인용', renderMarkdown('> 접는 게 좋겠다\n> 라고 말했다') === '<blockquote>접는 게 좋겠다 라고 말했다</blockquote>', renderMarkdown('> 접는 게 좋겠다\n> 라고 말했다'))
t('6. 외부 링크는 새 창 + rel', renderMarkdown('[출처](https://a.test/x)') === '<p><a href="https://a.test/x" target="_blank" rel="noopener noreferrer">출처</a></p>', renderMarkdown('[출처](https://a.test/x)'))
t('7. 내부 상대 링크는 같은 창', renderMarkdown('[케이스](/cases?status=approved)') === '<p><a href="/cases?status=approved">케이스</a></p>', renderMarkdown('[케이스](/cases?status=approved)'))
t('8. 문법 없는 글은 문단 하나', renderMarkdown('그냥 한 줄') === '<p>그냥 한 줄</p>')

// ── 이스케이프 (XSS) ────────────────────────────────────────────
t('9. escapeHtml 4문자', escapeHtml('&<>"') === '&amp;&lt;&gt;&quot;', escapeHtml('&<>"'))
t('10. 문단 속 <script> 는 태그로 살아나지 않는다', renderMarkdown('<script>alert(1)</script>') === '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>', renderMarkdown('<script>alert(1)</script>'))
t('11. 제목 속 <img onerror> 도 이스케이프', renderMarkdown('## <img src=x onerror=alert(1)>') === '<h2>&lt;img src=x onerror=alert(1)&gt;</h2>', renderMarkdown('## <img src=x onerror=alert(1)>'))
t('12. javascript: 링크는 링크가 아니라 글자로 남는다', renderMarkdown('[누르지마](javascript:alert(1))').includes('<a ') === false, renderMarkdown('[누르지마](javascript:alert(1))'))
t('13. data: URL 도 막는다', renderMarkdown('[x](data:text/html;base64,PHN2Zz4=)').includes('href=') === false, renderMarkdown('[x](data:text/html;base64,PHN2Zz4=)'))
t('14. 링크 글자의 따옴표·꺾쇠가 속성을 깨지 않는다', renderMarkdown('["><b>](https://a.test)') === '<p><a href="https://a.test" target="_blank" rel="noopener noreferrer">&quot;&gt;&lt;b&gt;</a></p>', renderMarkdown('["><b>](https://a.test)'))
t('15. 굵게 안의 태그도 이스케이프', renderMarkdown('**<b>굵게</b>**') === '<p><strong>&lt;b&gt;굵게&lt;/b&gt;</strong></p>', renderMarkdown('**<b>굵게</b>**'))
t('16. 목록 항목도 이스케이프', renderMarkdown('- <iframe src=x>') === '<ul><li>&lt;iframe src=x&gt;</li></ul>', renderMarkdown('- <iframe src=x>'))
t('17. 앰퍼샌드 이중 이스케이프 없음', renderMarkdown('A & B &amp; C') === '<p>A &amp; B &amp;amp; C</p>', renderMarkdown('A & B &amp; C'))

// ── columnReadable — 공개하면 안 되는 절을 털어 내는가 ─────────
const BODY = [
  '독자: 창업자',
  '판단 이유: 검증 행동이라서',
  '',
  '# 진짜 제목',
  '',
  '제품이 좋은데 계약이 안 붙으면 창업자는 보통 제품을 더 손본다.',
  '',
  '## 첫 소제목',
  '',
  '본문이 이어진다.',
  '',
  '---',
  '',
  '## 근거 메모',
  '- 출처 1',
  '',
  '## 자체 점검 (가이드 §10)',
  '0. 예',
].join('\n')
const readable = columnReadable(BODY)
t('18. 내부 메모(근거·자체 점검)는 잘려 나간다', !readable.markdown.includes('근거 메모') && !readable.markdown.includes('자체 점검'), readable.markdown)
t('19. 메타 줄·제목 줄은 빠진다', !readable.markdown.includes('독자:') && !readable.markdown.includes('판단 이유') && !readable.markdown.includes('# 진짜 제목'), readable.markdown)
t('20. 소제목·본문은 남는다', readable.markdown.includes('## 첫 소제목') && readable.markdown.includes('본문이 이어진다'), readable.markdown)
t('21. summary 는 첫 문단(소제목 아님)', readable.summary.startsWith('제품이 좋은데'), readable.summary)
t('22. summary 는 길이 상한에서 잘린다', columnReadable(BODY, 10).summary === '제품이 좋은데 계약…', columnReadable(BODY, 10).summary)
t('23. 본문 없으면 빈 summary (0건과 실패를 섞지 않게 빈 문자열)', columnReadable('독자: 셀러\n\n# 제목만').summary === '', JSON.stringify(columnReadable('독자: 셀러\n\n# 제목만')))

console.log(fail ? `실패 ${fail}건 / 통과 ${pass}건` : `통과 ${pass}건 — 문법 8 · 이스케이프 9 · columnReadable 6`)
process.exitCode = fail ? 1 : 0
