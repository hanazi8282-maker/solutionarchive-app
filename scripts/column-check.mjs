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
import path from 'node:path'
import { fileURLToPath } from 'node:url'
// 2026-09-29 남헌 결정 3건(읽기 수준·출처 흘려 쓰기·편 자족성)은 스레드 검사기와 같은 함수를 쓴다 — 칼럼과 편이 한 벌이라서다.
import { checkCitation, checkThreadPost, checkThreadSelfContained, readability } from '../lib/threads/voice-check.ts'

// 상한 8,000: 케이스-작성-가이드.md §5 (2026-09-15 남헌이 6,000 → 8,000). 가이드와 따로 놀면 기준에 맞는 칼럼이 오류로 뜬다.
const COLUMN_MIN = 3000, COLUMN_MAX = 8000, THREAD_MAX = 500
const len = (s) => [...s].length

/** §7-3 읽기 수준 — 칼럼·편 공통 "확인" 줄. 판정 수치는 가이드 §7-3 과 같다(평균 40자 안팎 → 55 넘으면 경고, 90자 초과 0). */
function readabilityWarns(text) {
  const rd = readability(text)
  const out = []
  if (rd.avg > 55) out.push(`문장 평균 ${rd.avg}자 — 40자 안팎으로(§7-3 고1·고2 기준)`)
  if (rd.long.length) out.push(`90자 넘는 문장 ${rd.long.length}개("${rd.long[0]}") — 둘로 자른다(§7-3)`)
  if (rd.acronyms.length) out.push(`풀이 없는 약어 ${rd.acronyms.join(', ')} — 첫 등장에서 우리말로(§7-3)`)
  return out
}

// 검증에서 실제로 걸린 패턴만. 걸리면 "고쳐라"가 아니라 "원문에 있는지 봐라"다.
const CAUSAL = /(불렀다|때문에|그래서|덕분에|이끌었다|만들었다|낳았다)/g
const TIME = /(지금도|여전히|현재|아직도|요즘)/g
const GENERAL = /^(사람들은|소비자는|고객은|창업자는|보통은?|누구나|대부분은)\s/m

// research: 짝 .research.md 본문. ops/roles/cmo.md(#98) 칼럼 파이프라인은 §10 점검을 .research.md 에 둔다.
export function checkColumn(src, research = '') {
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
  if (!/^##.*자체 점검/m.test(`${text}\n${research}`)) errors.push('`## 자체 점검` 절이 칼럼에도 짝 .research.md 에도 없다 (§10)')
  const causal = head.match(CAUSAL) || []
  if (causal.length) warns.push(`인과 표현 ${causal.length}회 — 각각 원문에 그 인과가 있는지 본다 (§10-9)`)
  const time = head.match(TIME) || []
  if (time.length) warns.push(`시점 표현 ${time.length}회 (${[...new Set(time)].join(', ')}) — 근거 시점과 맞는지 본다 (§10-11)`)
  const gen = head.match(GENERAL)
  if (gen) warns.push(`문장이 "${gen[1]}"로 시작 — 몇 건이 받치는지 적었는지 본다 (§10-10)`)
  const selfReport = (head.match(/밝힌/g) || []).length
  if (selfReport === 0) warns.push('"밝힌" 귀속이 0회 — 자기보고 수치가 없는 글인지 확인 (§10-7)')
  // §8-2 출처 흘려 쓰기 — 설명 문장은 오류, 귀속 표현은 1,000자당 1회 안팎(넘으면 확인).
  const cit = checkCitation(head)
  if (cit.meta) errors.push(`출처 설명 문장("${cit.meta.slice(0, 30)}…") — 본문에서 지우고 근거 메모로 (§8-2)`)
  const attrCap = Math.ceil(n / 1000) + 1
  if (cit.attributions > attrCap) warns.push(`귀속 표현 ${cit.attributions}회 — 1,000자당 1회 안팎(${attrCap}회까지)으로 줄인다 (§8-2)`)
  warns.push(...readabilityWarns(head))
  return { chars: n, errors, warns }
}

/**
 * 편 하나(본문 평문) — drafts/threads/*.body.txt 나 .threads.md 의 한 블록. 문체(checkThreadPost) + 자족성(SC-1~SC-5).
 * checkThreadPost 의 해요체 경고는 정착일(2026-09-11) 이후 기준으로 본다 — 지금 쓰는 글이라서다.
 */
export function checkPost(body, { subject = null } = {}) {
  const voice = checkThreadPost(body, new Date().toISOString())
  const sc = checkThreadSelfContained(body, { subject })
  return { chars: voice.chars, errors: [...voice.errors, ...sc.errors], warns: [...voice.warns, ...sc.warns] }
}

export function checkThreads(src) {
  const text = src.replace(/\r/g, '')
  const parts = text.split(/\n## (\d+)편[^\n]*\n/)
  const out = []
  for (let k = 1; k < parts.length; k += 2) {
    const p = parts[k + 1]
    // 블록을 전부 모은다. ```text 펜스가 본문·자기답글 순으로 온다.
    // 첫 펜스만 보면 자기답글이 통째로 검사에서 빠진다(2026-09-17 juicero 4편에서 실제로 놓쳤다).
    let blocks = [...p.matchAll(/```text\n([\s\S]*?)```/g)].map((m) => m[1].replace(/\n+$/, ''))
    if (!blocks.length) {
      const b = (p.match(/\*\*본문\*\*\s*\n([\s\S]*?)\n\s*\*\*자기답글\*\*/) || [])[1]
      const r = (p.match(/\*\*자기답글\*\*\s*\n([\s\S]*)$/) || [])[1]
      blocks = [b, r].filter((x) => x !== undefined).map((x) => x.replace(/\n+$/, '').trim())
    }
    const body = blocks[0] || ''
    const errors = [], warns = []
    const n = len(body)
    if (!body) errors.push('본문 블록을 찾지 못했다 (```text 또는 **본문**/**자기답글**)')
    // 길이는 블록마다 독립으로 본다. 자기답글은 개수 제한이 없고 이어 달 수 있다(가이드 §5).
    // 기호·출처 검사는 본문에만 건다 — 자기답글은 출처 URL 을 적는 자리다.
    const overs = blocks
      .map((b, i) => ({ label: i === 0 ? '본문' : `자기답글 ${i}`, c: len(b) }))
      .filter((x) => x.c > THREAD_MAX)
    if (overs.length) errors.push(`${THREAD_MAX}자 초과 — ${overs.map((x) => `${x.label} ${x.c}자`).join(', ')}`)
    if (/[→⇒←—]/.test(body)) errors.push('본문에 기호 (voice-guide §5)')
    if (/\(출처|S-1|8-K|10-K|제3자 검증/.test(body)) errors.push('본문에 출처 괄호·게이트 용어 (voice-guide §5)')
    // 2026-09-29: 편 자족성(SC-1~SC-5) + 출처 흘려 쓰기 + 읽기 수준. `- 주체:` 줄이 있으면 SC-3 을 그 이름으로 정확히 본다.
    if (body) {
      const subject = (p.match(/^-\s*\*{0,2}주체\*{0,2}\s*[:：]\s*\*{0,2}([^\n*]+)/m) || [])[1]?.trim() || null
      const sc = checkThreadSelfContained(body, { subject })
      errors.push(...sc.errors)
      warns.push(...sc.warns)
      const cit = checkCitation(body)
      if (cit.meta) errors.push(`출처 설명 문장("${cit.meta.slice(0, 30)}…") — 자기답글로 (가이드 §8-2)`)
      if (cit.attributions > 1) warns.push(`귀속 표현 ${cit.attributions}회 — 한 편 1회까지 (가이드 §8-2)`)
      warns.push(...readabilityWarns(body))
    }
    const hook = body.split('\n')[0] || ''
    if (hook && GENERAL.test(hook + ' ')) warns.push(`훅이 "${hook.slice(0, 20)}…" — 사례에 붙은 문장인지 본다 (가이드 §11)`)
    if (!/마무리 유형/.test(p)) warns.push('마무리 유형(질문·정리) 표기가 없다')
    if (/부정 사례|실패/.test(text.slice(0, 600)) && !/발행:\s*불가/.test(p)) warns.push('부정 사례인데 `발행: 불가` 표시가 없다')
    out.push({ n: parts[k], chars: n, blockChars: blocks.map(len), errors, warns, body })
  }
  return out
}

function run(paths) {
  let bad = 0
  for (const f of paths) {
    if (!existsSync(f)) { console.log(`✗ ${f}: 파일 없음`); bad++; continue }
    const src = readFileSync(f, 'utf8')
    if (/\.body\.txt$/.test(f)) {
      // 케이스 무브 초안(drafts/threads/*.body.txt). 편 하나짜리 글도 혼자 서야 한다(voice-guide §7).
      const r = checkPost(src)
      const mark = r.errors.length ? '✗' : '✓'
      console.log(`${mark} ${f} 본문 ${r.chars}자${r.errors.map((e) => `\n    오류: ${e}`).join('')}${r.warns.map((w) => `\n    확인: ${w}`).join('')}`)
      if (r.errors.length) bad++
    } else if (/\.threads\.md$/.test(f)) {
      const res = checkThreads(src)
      if (!res.length) { console.log(`✗ ${f}: 편을 하나도 못 찾았다`); bad++; continue }
      for (const t of res) {
        const mark = t.errors.length ? '✗' : '✓'
        const reply = t.blockChars.length > 1 ? ` · 자기답글 ${t.blockChars.slice(1).join('/')}자` : ''
        console.log(`${mark} ${f} ${t.n}편 본문 ${t.chars}자${reply}${t.errors.map((e) => `\n    오류: ${e}`).join('')}${t.warns.map((w) => `\n    확인: ${w}`).join('')}`)
        if (t.errors.length) bad++
      }
    } else if (/\.md$/.test(f) && !/\.(research|analysis|verify)\.md$/.test(f)) {
      const researchPath = f.replace(/\.md$/, '.research.md')
      const r = checkColumn(src, existsSync(researchPath) ? readFileSync(researchPath, 'utf8') : '')
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
  const noSelf = good.replace(/\n\n## 자체 점검[\s\S]*$/, '')
  assert(checkColumn(noSelf).errors.some((e) => e.includes('자체 점검')), 'self-check missing everywhere')
  assert(checkColumn(noSelf, '# r\n\n## 가이드 §10 자체 점검\n0. 예').errors.length === 0, 'self-check in .research.md accepted')
  assert(checkColumn(`독자: 창업자\n\n# 제목\n\n${'가'.repeat(7900)}\n\n---\n\n## 근거 메모\n- x\n\n## 자체 점검\n0. 예`).errors.length === 0, '7,900 within 8,000 cap')
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
  // 본문은 짧고 자기답글만 500자를 넘는 경우. 이걸 못 잡아서 juicero 4편을 놓쳤다.
  const reply = `# t\n\n## 1편\n\n- 마무리 유형: 질문\n\n\`\`\`text\n짧은 본문\n\`\`\`\n\n**자기답글**\n\n\`\`\`text\n${'다'.repeat(513)}\n\`\`\`\n`
  const tr = checkThreads(reply)
  assert(tr[0].chars === 5, 'body still measured alone')
  assert(tr[0].blockChars.length === 2 && tr[0].blockChars[1] === 513, 'self-reply block captured')
  assert(tr[0].errors.some((e) => e.includes('자기답글 1 513자')), 'over-length self-reply flagged with label')
  // 2026-09-29 — 편 자족성·출처 흘려 쓰기·읽기 수준. 상세 픽스처는 scripts/column-style-selftest.mjs 에 있다.
  const dep = `# t\n\n## 3편\n\n- 주체: 조선미녀\n- 마무리 유형: 질문\n\n\`\`\`text\n그 회사는 1편에서 말한 대로 갔다. 이 수치는 회사 블로그에 있다.\n\n${'라'.repeat(200)}\n\`\`\`\n`
  const td = checkThreads(dep)[0]
  assert(td.errors.some((e) => e.startsWith('SC-1')), 'series reference is SC-1 error')
  assert(td.errors.some((e) => e.startsWith('SC-2')), 'anaphora opening is SC-2 error')
  assert(td.errors.some((e) => e.startsWith('SC-3')), 'declared subject missing is SC-3 error')
  assert(td.errors.some((e) => e.includes('출처 설명 문장')), 'citation meta sentence is error')
  const meta = `독자: 창업자\n\n# 제목\n\n이 근거는 회사 블로그에서 나왔다. ${'가'.repeat(3100)}\n\n---\n\n## 근거 메모\n- x\n\n## 자체 점검\n0. 예`
  assert(checkColumn(meta).errors.some((e) => e.includes('출처 설명 문장')), 'column citation meta sentence is error')
  assert(checkColumn(good).errors.length === 0, 'good column still passes after 09-29 checks')
  const ok = checkPost('조선미녀는 한방 화장품을 미국에 팔았다. ' + '국내에서 촌스럽다던 한방을 숨기지 않았다. '.repeat(6) + '\n\n당신의 약점은 어느 시장에서 무기가 되는가?')
  assert(ok.errors.length === 0, `self-contained post passes: ${ok.errors.join(' / ')}`)
  console.log('self-test ok')
}

// scripts/column-stage.mjs 가 checkColumn/checkThreads 를 재사용하려고 이 파일을 import 한다 —
// 이 아래 CLI 블록이 가드 없이 process.argv 를 봤다면, import 만으로도 이 파일 자신의
// --self-test 나 run() 이 다시 돌면서 process.exit() 로 호출자를 끊었을 것이다.
function isMain() {
  if (!process.argv[1]) return false
  try { return path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url)) }
  catch { return false }
}
if (isMain()) {
  const args = process.argv.slice(2)
  if (args[0] === '--self-test') selfTest()
  else if (!args.length) { console.log('usage: node scripts/column-check.mjs <drafts/columns/*.md> | --self-test'); process.exit(1) }
  else process.exit(run(args) ? 1 : 0)
}
