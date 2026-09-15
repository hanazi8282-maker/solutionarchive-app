#!/usr/bin/env node
// 칼럼·스레드 초안의 기계 점검. 사람 검수와 독립 검증을 대신하지 않는다 — 그 전에 걸러 낼 수 있는 것만 본다.
// 기준: content/guides/케이스-작성-가이드.md §5(분량) §7(문체) §10(점검표), voice-guide.md §4(500자)
//
//   node scripts/column-check.mjs drafts/columns/2026-09-15-juicero.md
//   node scripts/column-check.mjs drafts/columns/2026-09-15-*.md      # 여러 개
//   node scripts/column-check.mjs --self-test
//
// exit 0 = 오류 없음(경고는 있을 수 있음), exit 1 = 오류.
import { readFileSync, existsSync } from 'node:fs'

const COLUMN_MIN = 3000, COLUMN_MAX = 6000, THREAD_MAX = 500
const len = (s) => [...s].length

// 검증에서 실제로 걸린 패턴만. 걸리면 "고쳐라"가 아니라 "원문에 있는지 봐라"다.
const CAUSAL = /(불렀다|때문에|그래서|덕분에|이끌었다|만들었다|낳았다)/g
const TIME = /(지금도|여전히|현재|아직도|요즘)/g
const GENERAL = /^(사람들은|소비자는|고객은|창업자는|보통은?|누구나|대부분은)\s/m

export function checkColumn(src) {
  const errors = [], warns = []
  const text = src.replace(/\r/g, '')
  const [head] = text.split(/\n---\n/)
  if (!/^독자:\s*(창업자|셀러)/m.test(text)) errors.push('첫머리에 `독자: 창업자` 또는 `독자: 셀러` 가 없다 (§10-0)')
  if (!/^#\s+/m.test(head)) errors.push('제목(# )이 없다')
  const n = len(head)
  if (n < COLUMN_MIN || n > COLUMN_MAX) errors.push(`본문 ${n}자 — ${COLUMN_MIN}~${COLUMN_MAX}자 밖 (§5)`)
  if (/[→⇒←]/.test(head)) errors.push('본문에 화살표 기호 (§7)')
  if (/—/.test(head)) errors.push('본문에 em-dash (§7)')
  if (!/## 근거 메모/.test(text)) errors.push('`## 근거 메모` 절이 없다 (§10-8)')
  if (!/## 자체 점검/.test(text)) errors.push('`## 자체 점검` 절이 없다 (§10)')
  const causal = head.match(CAUSAL) || []
  if (causal.length) warns.push(`인과 표현 ${causal.length}회 — 각각 원문에 그 인과가 있는지 본다 (§10-9)`)
  const time = head.match(TIME) || []
  if (time.length) warns.push(`시점 표현 ${time.length}회 (${[...new Set(time)].join(', ')}) — 근거 시점과 맞는지 본다 (§10-11)`)
  const gen = head.match(GENERAL)
  if (gen) warns.push(`문장이 "${gen[1]}"로 시작 — 몇 건이 받치는지 적었는지 본다 (§10-10)`)
  const selfReport = (head.match(/밝힌/g) || []).length
  if (selfReport === 0) warns.push('"밝힌" 귀속이 0회 — 자기보고 수치가 없는 글인지 확인 (§10-7)')
  return { chars: n, errors, warns }
}

export function checkThreads(src) {
  const text = src.replace(/\r/g, '')
  const parts = text.split(/\n## (\d+)편[^\n]*\n/)
  const out = []
  for (let k = 1; k < parts.length; k += 2) {
    const p = parts[k + 1]
    let body = (p.match(/```text\n([\s\S]*?)```/) || [])[1]
    if (body === undefined) body = (p.match(/\*\*본문\*\*\s*\n([\s\S]*?)\n\s*\*\*자기답글\*\*/) || [])[1]
    body = (body || '').replace(/\n$/, '')
    const errors = [], warns = []
    const n = len(body)
    if (!body) errors.push('본문 블록을 찾지 못했다 (```text 또는 **본문**/**자기답글**)')
    if (n > THREAD_MAX) errors.push(`본문 ${n}자 — ${THREAD_MAX}자 초과`)
    if (/[→⇒←—]/.test(body)) errors.push('본문에 기호 (voice-guide §5)')
    if (/\(출처|S-1|8-K|10-K|제3자 검증/.test(body)) errors.push('본문에 출처 괄호·게이트 용어 (voice-guide §5)')
    const hook = body.split('\n')[0] || ''
    if (hook && GENERAL.test(hook + ' ')) warns.push(`훅이 "${hook.slice(0, 20)}…" — 사례에 붙은 문장인지 본다 (가이드 §11)`)
    if (!/마무리 유형/.test(p)) warns.push('마무리 유형(질문·정리) 표기가 없다')
    if (/부정 사례|실패/.test(text.slice(0, 600)) && !/발행:\s*불가/.test(p)) warns.push('부정 사례인데 `발행: 불가` 표시가 없다')
    out.push({ n: parts[k], chars: n, errors, warns })
  }
  return out
}

function run(paths) {
  let bad = 0
  for (const f of paths) {
    if (!existsSync(f)) { console.log(`✗ ${f}: 파일 없음`); bad++; continue }
    const src = readFileSync(f, 'utf8')
    if (/\.threads\.md$/.test(f)) {
      const res = checkThreads(src)
      if (!res.length) { console.log(`✗ ${f}: 편을 하나도 못 찾았다`); bad++; continue }
      for (const t of res) {
        const mark = t.errors.length ? '✗' : '✓'
        console.log(`${mark} ${f} ${t.n}편 ${t.chars}자${t.errors.map((e) => `\n    오류: ${e}`).join('')}${t.warns.map((w) => `\n    확인: ${w}`).join('')}`)
        if (t.errors.length) bad++
      }
    } else if (/\.md$/.test(f) && !/\.(research|analysis)\.md$/.test(f)) {
      const r = checkColumn(src)
      const mark = r.errors.length ? '✗' : '✓'
      console.log(`${mark} ${f} ${r.chars}자${r.errors.map((e) => `\n    오류: ${e}`).join('')}${r.warns.map((w) => `\n    확인: ${w}`).join('')}`)
      if (r.errors.length) bad++
    }
  }
  return bad
}

function selfTest() {
  const assert = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1) } }
  const good = `독자: 창업자\n\n# 제목\n\n${'가'.repeat(3100)}\n\n---\n\n## 근거 메모\n- x\n\n## 자체 점검\n0. 예`
  assert(checkColumn(good).errors.length === 0, 'good column should pass')
  const bad = `# 제목\n\n짧다 → 화살표 — 대시\n`
  const r = checkColumn(bad)
  assert(r.errors.some((e) => e.includes('독자')), 'missing 독자')
  assert(r.errors.some((e) => e.includes('화살표')), 'arrow')
  assert(r.errors.some((e) => e.includes('em-dash')), 'emdash')
  assert(r.errors.some((e) => e.includes('자 —')), 'length')
  const th = `# t\n\n## 1편\n\n- 마무리 유형: 질문\n\n\`\`\`text\n사람들은 보통 이렇게 한다.\n\n${'나'.repeat(490)}\n\`\`\`\n\n## 2편\n\n**본문**\n\n짧은 본문\n\n**자기답글**\n\nx\n`
  const t = checkThreads(th)
  assert(t.length === 2, 'two threads parsed')
  assert(t[0].errors.some((e) => e.includes('초과')), 'over 500')
  assert(t[0].warns.some((w) => w.includes('훅이')), 'general hook flagged')
  assert(t[1].errors.length === 0 && t[1].chars === 5, 'bold-format thread parsed')
  console.log('self-test ok')
}

const args = process.argv.slice(2)
if (args[0] === '--self-test') selfTest()
else if (!args.length) { console.log('usage: node scripts/column-check.mjs <drafts/columns/*.md> | --self-test'); process.exit(1) }
else process.exit(run(args) ? 1 : 0)
