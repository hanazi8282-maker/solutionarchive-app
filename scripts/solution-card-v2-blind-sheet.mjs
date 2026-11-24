#!/usr/bin/env node
// 솔루션 카드 v2 시험 틀(v71ef) — 실제 12곳 블라인드 채점표 생성기. 모델 호출 없음·DB 없음.
//   node scripts/solution-card-v2-blind-sheet.mjs --cases <cases.json> [--cards <cards.json>] [--out <경로.md>] [--seed 20261124]
//     cases.json = [{ id, company: {name, description, weaknesses?}, problem_ko, facts: {problem, action, result, conditions} }] — 정확히 12곳
//     cards.json = { <id>: CardV2 }  (호출 시험 뒤에 채운다. 없으면 입력 확인표만 만든다)
// 채점표: 카드를 id 해시 순서로 섞고(시드), 내부 id·출처·근거 등급·플래그를 가린다. 채점자는 칸마다 ○/△/✕ 와 한 줄 사유.
// 채점 항목 = 7칸 각각 + 사례 사실 일치(③이 사례 DB 에만 있나) + 숫자 지어냄 여부. 검증기(validateCardV2)로 형식·숫자 가드를 기계 검사해 같이 적는다.
import fs from 'node:fs'
import crypto from 'node:crypto'
import { validateCardV2, SECTIONS, BLUE_KEYS, stripInternal } from '../lib/solution-card/card-v2.ts'

const args = process.argv.slice(2)
const opt = (n, d = null) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d }
const casesF = opt('cases'), cardsF = opt('cards'), seed = opt('seed', '20261124'), out = opt('out', 'reports/solution-card-v2-blind-sheet.md')
if (!casesF) { console.error('사용법: --cases <cases.json> [--cards <cards.json>] [--out 경로] [--seed 20261124]'); process.exit(64) }
const cases = JSON.parse(fs.readFileSync(casesF, 'utf8'))
if (!Array.isArray(cases) || cases.length !== 12) { console.error(`실제 12곳이 필요하다(지금 ${Array.isArray(cases) ? cases.length : '배열 아님'}곳)`); process.exit(2) }
const cards = cardsF ? JSON.parse(fs.readFileSync(cardsF, 'utf8')) : {}
const h = (id) => crypto.createHash('md5').update(`${seed}|${id}`).digest('hex')
const order = cases.slice().sort((a, b) => (h(a.id) < h(b.id) ? -1 : 1))
const md = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\n/g, ' ')
const L = [`# 솔루션 카드 v2 블라인드 채점 — 12곳 (시드 ${seed})`, '', '채점자에게 보이는 것: 회사 소개·문제·카드 7칸. 가려진 것: 내부 id·출처·근거 등급·플래그·모델 이름. 칸마다 ○(좋다) △(고치면 쓴다) ✕(못 쓴다)와 한 줄 사유. ④⑤⑥⑦은 우리 제안이라 파란 글씨, ③은 사례 사실이라 검은 글씨.', '']
const key = []
order.forEach((c, n) => {
  const card = cards[c.id]
  const v = card ? validateCardV2(card, c.facts) : null
  key.push(`${n + 1}\t${c.id}\t${v ? (v.ok ? '기계검사 통과' : '기계검사 실패: ' + v.errors.join(' / ')) : '카드 없음'}`)
  L.push(`## 곳 ${n + 1}`, '', `- 회사: ${md(c.company?.description)}`, `- 지금 문제(고객 말): ${md(c.problem_ko)}`, '')
  if (!card) { L.push('(카드 없음 — 호출 시험 뒤에 채운다)', ''); return }
  const d = stripInternal(card)
  L.push('| 칸 | 내용 | 글씨 | ○/△/✕ | 한 줄 사유 |', '| --- | --- | --- | --- | --- |')
  const cell = {
    situation: `${d.situation?.text ?? ''} ${d.situation?.cause ?? ''}`, direction: d.direction,
    case: `누가: ${d.case?.who} · 같은 문제: ${d.case?.same_problem} · 한 일: ${d.case?.did} · 결과: ${d.case?.result}`,
    steps: (d.steps ?? []).map((s, i) => `${i + 1}) ${s.title} — ${s.how}`).join(' ⏎ '), why: d.why, fit: d.fit, after: d.after,
  }
  for (const s of SECTIONS) L.push(`| ${s.no} ${s.title} | ${md(cell[s.key])} | ${BLUE_KEYS.includes(s.key) ? '파랑' : '검정'} |  |  |`)
  if (d.places?.length) L.push(`| 해볼 곳 | ${md(d.places.map((p) => `${p.name}: ${p.note}`).join(' ⏎ '))} | - |  |  |`)
  if (d.cautions?.length) L.push(`| 조심할 것 | ${md(d.cautions.map((x) => `닫은 곳 ${x.closed_place} · 원인 ${x.cause} · 우리에게 닿는 부분 ${x.reaches_us} · 피하는 법 ${x.avoid}`).join(' ⏎ '))} | - |  |  |`)
  L.push(`| 사례 사실이 사례 DB 에만 있나 | | | ☐예 ☐아니오 |  |`, `| 숫자·기간을 지어냈나 | | | ☐없음 ☐있음 |  |`, '')
})
L.push('---', '', '<!-- 채점자에게 주지 않는 열쇠(곳 번호 → id · 기계검사):', ...key, '-->')
fs.mkdirSync(out.replace(/[\\/][^\\/]*$/, '') || '.', { recursive: true })
fs.writeFileSync(out, L.join('\n') + '\n')
console.log(`쓴 파일 ${out} — 12곳 · 카드 ${Object.keys(cards).length}장`)
