// 파일럿 검수 페이지 생성기 — drafts/columns/*.md 를 읽어 pilot-review.html 한 파일로 만든다.
// 실행: node drafts/columns/_review/build.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const cols = join(here, '..')

const PILOTS = [
  {
    slug: 'beauty-of-joseon', label: '조선미녀', kind: '케이스 · 성공',
    source: '기존 케이스 + 웹 보강 조사',
    verify: { total: 70, over: 11, absent: 2, unknown: 0, status: '전부 수정' },
    note: '인과 덧붙이기, 범위 넓히기, 시점 빼기가 대부분이었다. "미국에서 3,237억"은 전체 매출이었다.',
  },
  {
    slug: 'juicero', label: 'Juicero', kind: '케이스 · 실패',
    source: '기존 케이스 + 웹 보강 조사',
    verify: { total: 80, over: 9, absent: 4, unknown: 0, status: '전부 수정' },
    note: '조사가 가설을 뒤집었다. "아무도 원치 않았다"가 아니라, 산 사람은 안 떠났고 원가와 인프라에서 멈췄다. 스레드는 규칙대로 발행 불가 표시.',
  },
  {
    slug: 'hairloss-shampoo-reviews', label: '탈모샴푸 리뷰 596건', kind: '대시보드 · 리뷰 분석',
    source: '수집된 리뷰 원문 (TS 307 · 닥터포헤어 127 · 라보에이치 162)',
    verify: { total: 88, over: 26, absent: 4, unknown: 1, status: '전부 수정' },
    note: '인용과 식약처 문구는 전부 일치했다. 핵심 명제가 단정으로 쓰였고 "결제자는 가격을 본다"는 데이터와 반대였다. 고친 뒤 결론은 "시험해 볼 가설" 수준으로 약해졌고 스레드는 4편에서 2편으로 줄었다. 이 수준을 대시보드 칼럼으로 받아들일지가 판단 거리다.',
  },
]

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const inline = (s) => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  .replace(/(https?:\/\/[^\s)<]+)/g, '<a href="$1" rel="noopener" target="_blank">$1</a>')

// ponytail: 필요한 문법만 — 제목, 문단, 목록, 인용, 코드블록, 굵게. 표·중첩 목록은 없다.
function md(src) {
  const out = []
  const lines = src.replace(/\r/g, '').split('\n')
  let i = 0
  while (i < lines.length) {
    const l = lines[i]
    if (/^```/.test(l)) {
      const buf = []; i++
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++])
      i++; out.push(`<pre>${esc(buf.join('\n'))}</pre>`); continue
    }
    const h = l.match(/^(#{1,4})\s+(.*)/)
    if (h) { out.push(`<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`); i++; continue }
    if (/^---\s*$/.test(l)) { out.push('<hr>'); i++; continue }
    if (/^\s*[-*]\s+/.test(l)) {
      const buf = []
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) buf.push(`<li>${inline(lines[i++].replace(/^\s*[-*]\s+/, ''))}</li>`)
      out.push(`<ul>${buf.join('')}</ul>`); continue
    }
    if (/^\d+\.\s+/.test(l)) {
      const buf = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) buf.push(`<li>${inline(lines[i++].replace(/^\d+\.\s+/, ''))}</li>`)
      out.push(`<ol>${buf.join('')}</ol>`); continue
    }
    if (/^>\s?/.test(l)) {
      const buf = []
      while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''))
      out.push(`<blockquote>${md(buf.join('\n'))}</blockquote>`); continue
    }
    if (!l.trim()) { i++; continue }
    const buf = []
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|```|>|\s*[-*]\s+|\d+\.\s+|---\s*$)/.test(lines[i])) buf.push(lines[i++])
    out.push(`<p>${inline(buf.join(' '))}</p>`)
  }
  return out.join('\n')
}

const len = (s) => [...s].length

function parseColumn(src) {
  const [head, ...rest] = src.replace(/\r/g, '').split(/\n---\n/)
  const reader = (head.match(/^독자:\s*(.+)$/m) || [])[1] || '미표기'
  const title = (head.match(/^#\s+(.+)$/m) || [])[1] || ''
  const body = head.slice(head.indexOf('\n#', 0) >= 0 ? head.search(/^#\s/m) : 0).replace(/^#\s+.+\n/, '')
  const tail = rest.join('\n---\n')
  const [memo, check] = tail.split(/\n## 자체 점검[^\n]*\n/)
  return { reader, title, body, chars: len(head), memo: memo.replace(/^\s*## 근거 메모\s*/, ''), check: check || '' }
}

function parseThreads(src) {
  const parts = src.replace(/\r/g, '').split(/\n## (\d+)편[^\n]*\n/)
  const intro = parts[0]
  const threads = []
  for (let k = 1; k < parts.length; k += 2) {
    const p = parts[k + 1]
    const head = src.match(new RegExp(`\\n## ${parts[k]}편\\.?\\s*([^\\n]*)`))
    const title = (p.match(/제목(?:\(인사이트\))?\**:?\**\s*:?\s*(.+)/) || [])[1] || (head && head[1]) || ''
    const hook = (p.match(/훅 유형\**:?\**\s*:?\s*(.+)/) || [])[1] || ''
    const end = (p.match(/마무리 유형\**:?\**\s*:?\s*(.+)/) || [])[1] || ''
    const blocked = /발행:\s*불가/.test(p)
    const fences = [...p.matchAll(/```text\n([\s\S]*?)```/g)].map((m) => m[1].replace(/\n$/, ''))
    let body = fences[0], reply = fences[1]
    if (!body) {
      body = ((p.match(/\*\*본문\*\*\s*\n([\s\S]*?)\n\s*\*\*자기답글\*\*/) || [])[1] || '').trim()
      reply = ((p.match(/\*\*자기답글\*\*\s*\n([\s\S]*?)(?:\n---|\s*$)/) || [])[1] || '').trim()
    }
    threads.push({ n: parts[k], title: title.replace(/\*+/g, '').trim(), hook: hook.replace(/\*+/g, '').trim(), end: end.replace(/\*+/g, '').trim(), blocked, body, reply: reply || '', chars: len(body) })
  }
  return { intro, threads }
}

const para = (s) => s.split(/\n{2,}/).map((b) => `<p>${inline(b).replace(/\n/g, '<br>')}</p>`).join('')

function renderPilot(p, idx) {
  const col = parseColumn(readFileSync(join(cols, `2026-09-15-${p.slug}.md`), 'utf8'))
  const th = parseThreads(readFileSync(join(cols, `2026-09-15-${p.slug}.threads.md`), 'utf8'))
  const v = p.verify
  const fixed = v.over + v.absent
  const threadCards = th.threads.map((t) => `
      <article class="thread${t.blocked ? ' is-blocked' : ''}">
        <header>
          <span class="tno">${t.n}편</span>
          ${t.blocked ? '<span class="chip chip-stop">발행 불가</span>' : ''}
          <span class="chip">${esc(t.hook || '훅 미표기')}</span>
          <span class="chip">${esc(t.end || '마무리 미표기')}</span>
        </header>
        <h4>${inline(t.title)}</h4>
        <div class="tbody">${para(t.body)}</div>
        <div class="meter" role="img" aria-label="본문 ${t.chars}자, 한도 500자">
          <span class="bar" style="width:${Math.min(100, t.chars / 5)}%"></span>
          <span class="mnum">${t.chars}<small> / 500자</small></span>
        </div>
        <details><summary>자기답글</summary><div class="reply">${para(t.reply)}</div></details>
      </article>`).join('')

  return `
  <section class="pilot" id="p${idx + 1}" aria-labelledby="p${idx + 1}-h">
    <div class="pilot-head">
      <p class="eyebrow">파일럿 ${idx + 1} · ${esc(p.kind)}</p>
      <h2 id="p${idx + 1}-h">${esc(p.label)}</h2>
      <dl class="facts">
        <div><dt>독자</dt><dd>${esc(col.reader)}</dd></div>
        <div><dt>칼럼 본문</dt><dd class="num">${col.chars.toLocaleString('ko-KR')}자</dd></div>
        <div><dt>스레드</dt><dd class="num">${th.threads.length}편</dd></div>
        <div><dt>원천</dt><dd>${esc(p.source)}</dd></div>
      </dl>
      <div class="proof" aria-label="독립 검증 결과">
        <span class="proof-label">독립 검증</span>
        <span class="num">${v.total}개 확인</span>
        <span class="mark mark-over">과장·왜곡 <b class="num">${v.over}</b></span>
        <span class="mark mark-absent">원문에 없음 <b class="num">${v.absent}</b></span>
        ${v.unknown ? `<span class="mark">확인 불가 <b class="num">${v.unknown}</b></span>` : ''}
        <span class="mark mark-fixed">${fixed}건 ${esc(v.status)}</span>
      </div>
      <p class="pnote">${esc(p.note)}</p>
    </div>

    <div class="column">
      <h3 class="ctitle">${inline(col.title)}</h3>
      <div class="prose">${md(col.body)}</div>
      <details class="memo"><summary>근거 메모</summary><div class="small">${md(col.memo)}</div></details>
      <details class="memo"><summary>작가 자체 점검 (검증 뒤 수정본)</summary><div class="small">${md(col.check)}</div></details>
    </div>

    <h3 class="threads-h">여기서 뗀 스레드</h3>
    <div class="threads">${threadCards}</div>
  </section>`
}

const pilots = PILOTS.map(renderPilot).join('\n')
const verifyRows = PILOTS.map((p) => {
  const v = p.verify, rate = Math.round(((v.over + v.absent) / v.total) * 100)
  return `<li><span class="vr-name">${esc(p.label)}</span><span class="vr-track"><span class="vr-fill" style="width:${rate}%"></span></span><span class="num vr-num">${v.over + v.absent} / ${v.total} <small>(${rate}%)</small></span></li>`
}).join('')

const html = readFileSync(join(here, 'template.html'), 'utf8')
  .replace('<!--VERIFY_ROWS-->', verifyRows)
  .replace('<!--PILOTS-->', pilots)
writeFileSync(join(here, 'pilot-review.html'), html)
console.log('wrote pilot-review.html', len(html), 'chars')
