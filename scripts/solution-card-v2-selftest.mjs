#!/usr/bin/env node
// 솔루션 카드 v2 셀프테스트(v71ef) — 모델 호출·DB·네트워크 없음.   node scripts/solution-card-v2-selftest.mjs
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CARD_VERSION, SECTIONS, BLUE_KEYS, FORBIDDEN_KEYS, validateCardV2, stripInternal, numbersOf } from '../lib/solution-card/card-v2.ts'
import { SYSTEM_V2, buildUserV2 } from '../lib/solution-card/prompt-v2.ts'

let pass = 0, fail = 0
const t = (name, fn) => { try { fn(); pass++ } catch (e) { fail++; console.error('✗', name, '\n  ', e.message.split('\n')[0]) } }
const facts = { problem: '리뷰가 거의 없었다', action: '구매 고객 20명에게 직접 리뷰를 부탁하는 메일을 보냈다', result: '2주 뒤 리뷰가 늘었다', conditions: '구매 고객 이메일이 있어야 한다' }
const card = () => ({
  version: CARD_VERSION, situation: { text: '리뷰가 없어서 처음 보는 사람이 믿고 사지 않아요', cause: '구매 뒤에 리뷰를 부탁하는 단계가 없어서로 보입니다' }, direction: '구매한 고객에게 직접 리뷰를 부탁하는 단계를 만든다.',
  case: { who: '작은 쇼핑몰 운영자', same_problem: '리뷰가 거의 없었다', did: '구매 고객 20명에게 리뷰를 부탁하는 메일을 보냈다', result: '2주 뒤 리뷰가 늘었다' },
  steps: [{ title: '구매 고객 목록 뽑기', how: '지난 한 달 구매 고객 이메일을 모은다' }, { title: '부탁 메일 쓰기', how: '"써 주시면 큰 도움이 됩니다"처럼 짧게' }, { title: '보내고 답하기', how: '답이 오면 바로 감사 인사' }],
  why: '리뷰가 없는 원인이 부탁 단계 부재라서 부탁이 곧 해결이다', fit: '우리는 고객 수가 적어 한 번에 보낸다', after: '새로 오는 사람이 리뷰를 먼저 보고 안심하는 모습',
  places: [{ name: '한국의 비슷한 후기 사이트', note: '후기 노출' }], cautions: [{ closed_place: '대가를 주는 후기', cause: '스토어가 금지', reaches_us: '선물 제공 시', avoid: '대가 없이 부탁만' }],
  flags: ['third_party_analysis'], internal: { evidence: [{ claim: '리뷰 부탁', quote: '구매 고객 20명에게', source_url: 'https://example.com' }], premises: ['P2'] },
})
t('정상 카드는 통과', () => assert.deepEqual(validateCardV2(card(), facts), { ok: true }))
t('7칸 순서·파랑 구분(④⑤⑥⑦)', () => { assert.equal(SECTIONS.length, 7); assert.deepEqual(SECTIONS.map((s) => s.no), ['①', '②', '③', '④', '⑤', '⑥', '⑦']); assert.deepEqual([...BLUE_KEYS], ['steps', 'why', 'fit', 'after']); assert.equal(SECTIONS.find((s) => s.key === 'case').voice, 'case') })
t('제외된 칸이 있으면 실패(출처·등급·이번 주 첫 단계·작은 실험·믿을 만한 정도)', () => { for (const k of FORBIDDEN_KEYS) { const c = card(); c[k] = 'x'; assert.equal(validateCardV2(c, facts).ok, false, k) } })
t('단계 3~4개 · 단계마다 방법', () => { const a = card(); a.steps = a.steps.slice(0, 2); assert.equal(validateCardV2(a, facts).ok, false); const b = card(); b.steps[0].how = ''; assert.equal(validateCardV2(b, facts).ok, false); const c = card(); c.steps.push({ title: 'd', how: 'e' }); assert.equal(validateCardV2(c, facts).ok, true); c.steps.push({ title: 'f', how: 'g' }); assert.equal(validateCardV2(c, facts).ok, false) })
t('원인은 "~로 보입니다"로 끝나야 한다', () => { const c = card(); c.situation.cause = '원인은 이것이다'; assert.equal(validateCardV2(c, facts).ok, false); const d = card(); delete d.situation.cause; assert.equal(validateCardV2(d, facts).ok, true); const e = card(); e.situation.cause = ''; assert.equal(validateCardV2(e, facts).ok, true) })
t('해결 방향은 한 문장', () => { const c = card(); c.direction = '첫 문장이다. 둘째 문장이다.'; assert.equal(validateCardV2(c, facts).ok, false) })
t('해볼 곳 ≤3 · 조심할 것 ≤1 · 조심할 것 네 칸', () => { const a = card(); a.places = [1, 2, 3, 4].map((n) => ({ name: 'n' + n, note: 'x' })); assert.equal(validateCardV2(a, facts).ok, false); const b = card(); b.cautions.push(b.cautions[0]); assert.equal(validateCardV2(b, facts).ok, false); const c = card(); c.cautions[0].avoid = ''; assert.equal(validateCardV2(c, facts).ok, false) })
t('③·⑦ 숫자를 지어내면 실패, 사례 DB 에 있는 숫자는 통과', () => { const a = card(); a.case.result = '2주 뒤 리뷰가 300% 늘었다'; const v = validateCardV2(a, facts); assert.equal(v.ok, false); assert.match(v.errors.join(), /300/); const b = card(); b.after = '3개월 안에 안정'; assert.equal(validateCardV2(b, facts).ok, false); const c = card(); c.after = '리뷰가 쌓이는 모습'; assert.equal(validateCardV2(c, facts).ok, true) })
t('사례에 숫자가 없으면 숫자 없는 ⑦ 만 허용', () => { const f = { ...facts, action: '고객에게 부탁했다', result: '리뷰가 늘었다', problem: '리뷰가 없었다' }; const c = card(); c.case.did = '고객에게 부탁했다'; c.case.result = '리뷰가 늘었다'; c.after = '리뷰가 늘어난 모습'; assert.equal(validateCardV2(c, f).ok, true); c.after = '리뷰가 50개로'; assert.equal(validateCardV2(c, f).ok, false) })
t('R-d: 성공 조건이 불확실하면 필요한 조건이 있어야 한다(카드는 둔다)', () => { const c = card(); c.flags = ['success_condition_unclear']; assert.equal(validateCardV2(c, facts).ok, false); c.needed_conditions = ['구매 고객 이메일 확보']; assert.equal(validateCardV2(c, facts).ok, true) })
t('전제(P)는 카드를 빼는 이유가 아니다 — 전제 없어도 통과', () => { const c = card(); delete c.internal.premises; assert.equal(validateCardV2(c, facts).ok, true) })
t('내부 근거·출처는 화면 JSON 에서 빠진다', () => { const d = stripInternal(card()); assert.equal('internal' in d, false); assert.equal(JSON.stringify(d).includes('example.com'), false) })
t('numbersOf: 쉼표·소수·기간', () => assert.deepEqual(numbersOf('$2.99 와 1,200명, 3개월.'), ['2.99', '1200', '3']))
t('프롬프트: 7칸·규칙 R-a~R-g·개수 제한·숫자 금지·화면 제외 항목이 들어 있다', () => {
  for (const s of ['① 지금 상황과 원인', '⑦ 해결되면 달라지는 모습', 'R-a', 'R-b', 'R-c', 'R-d', 'R-e', 'R-f', 'R-g', '3곳 이하', '1개 이하', '숫자·기간·금액을 새로 만들지 않는다', '"~로 보입니다"', '전제(P)는 참고용']) assert.ok(SYSTEM_V2.includes(s), s)
  for (const s of ['이번 주 첫 단계', '믿을 만한 정도', '작은 실험']) assert.ok(SYSTEM_V2.includes(s) && /쓰지 않는/.test(SYSTEM_V2.split(s)[0].slice(-120) + SYSTEM_V2.split(s)[1].slice(0, 5) ), s)
  assert.ok(!/undefined/.test(SYSTEM_V2))
})
t('buildUserV2: 사례 DB 칸을 따로 담고 <data> 로 감싼다', () => { const u = buildUserV2({ company: { description: 'x' }, problem_ko: 'y', facts }); assert.ok(u.startsWith('<data>') && u.endsWith('</data>') && u.includes('case_db') && u.includes('premises_reference_only')) })
t('모델·DB 를 부르지 않는다(소스 점검)', () => { for (const f of ['lib/solution-card/card-v2.ts', 'lib/solution-card/prompt-v2.ts', 'scripts/solution-card-v2-blind-sheet.mjs']) { const s = readFileSync(new URL('../' + f, import.meta.url), 'utf8'); assert.ok(!/anthropic|supabase|fetch\(|runCli|spawn/i.test(s.replace(/\/\/.*$/gm, '')), f) } })
t('블라인드 채점표: 12곳이 아니면 거부, 12곳이면 id·출처를 가리고 열쇠는 주석에', () => {
  const d = mkdtemp()
  const mk = (n) => Array.from({ length: n }, (_, i) => ({ id: 'case-' + i, company: { name: 'c' + i, description: '회사 ' + i }, problem_ko: '문제 ' + i, facts }))
  writeFileSync(join(d, 'c11.json'), JSON.stringify(mk(11)))
  assert.throws(() => execFileSync('node', ['scripts/solution-card-v2-blind-sheet.mjs', '--cases', join(d, 'c11.json'), '--out', join(d, 'o.md')], { stdio: 'pipe' }))
  const cs = mk(12), cards = { 'case-0': card() }
  writeFileSync(join(d, 'c12.json'), JSON.stringify(cs)); writeFileSync(join(d, 'k.json'), JSON.stringify(cards))
  execFileSync('node', ['scripts/solution-card-v2-blind-sheet.mjs', '--cases', join(d, 'c12.json'), '--cards', join(d, 'k.json'), '--out', join(d, 'o.md')], { stdio: 'pipe' })
  const md = readFileSync(join(d, 'o.md'), 'utf8'), body = md.split('<!--')[0]
  assert.ok((md.match(/^## 곳 /gm) ?? []).length === 12 && !body.includes('case-0') && !body.includes('example.com') && !body.includes('third_party_analysis') && md.includes('case-0\t기계검사 통과') && body.includes('파랑') && body.includes('검정'))
})
function mkdtemp() { return mkdtempSync(join(tmpdir(), 'sc2-')) }
console.log(`solution-card-v2 selftest: ${pass} pass · ${fail} fail`)
process.exit(fail ? 1 : 0)
