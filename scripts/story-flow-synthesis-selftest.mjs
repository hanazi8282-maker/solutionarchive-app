#!/usr/bin/env node
// [v71cu 4-1 회귀] 사례 기반 맞춤 적용 문장 층 — 프롬프트 금지 규칙·파서 경계값·근거 검사(지어낸 숫자·도구 이름)·평가 패킷 --synth(블라인드 유지·실패 칸 원래 모양)·문장·낱말 경계 자르기.
// 모델·DB 불필요(가짜 askJson + 픽스처 카드). consult-selftest 가 불러 CI 에서 돈다.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildSynthesisPrompt, parseSynthesis, verifySynthesis, synthesize, SYNTH_SYSTEM, SYNTH_LIMITS } from '../lib/consult/story-flow-synthesis.ts'
import { UNTRUSTED_INPUT_NOTICE } from '../lib/llm/untrusted-input.ts'
import { clipText, clipSentences, healClip, LABEL_CLIP } from '../lib/consult/clip-text.ts'
import { caseLine, pickSimilar } from '../lib/consult/cases-validate.ts'
import { buildPack, packetMarkdown, renderPanel, synthPick } from './story-flow-eval-pack.mjs'

// ── 프롬프트 ──
const D = { pitch: '소상공인 리뷰 답글 도우미, 월 9,900원', bottleneck: '사람들이 잘 모른다', situation: { 단계: 'zero_rev', 손님: 'smb' }, adversity: '검색 노출이 없다', story: '출시 석 달째 가입이 거의 없다.' }
const P = [
  { action: '리뷰를 검색 페이지로 만들었다', result: '검색 유입이 월 1,200명으로 늘었다', condition: '리뷰가 50개 이상일 때', quote_ko: '리뷰 페이지가 Google 에 잡혔다', quote_allowed: true },
  { action: '게스트 포스트를 Notion 으로 정리해 돌렸다', result: '가입 40% 증가', quote_ko: 'SECRET QUOTE 금지 소스', quote_allowed: false },
  { action: '대행사에 광고를 맡겼다', result: '돈만 쓰고 손님은 안 왔다', failed: true },
]
const pr = buildSynthesisPrompt(D, P)
for (const k of ['지어내기 금지', '인용 번호 필수', 'from_case', '인용 금지', '최대 3개', '최대 2개', '1주 안에', '잘 안 풀린 사례', '크게 안 맞으면', 'caveat', 'summary_for_you', 'JSON 하나만'])
  assert.ok(pr.system.includes(k), `프롬프트에 규칙 "${k}"`)
assert.ok(pr.system.includes(UNTRUSTED_INPUT_NOTICE) && pr.system === SYNTH_SYSTEM, '표준 경고 + 고정 system')
assert.ok(!pr.system.includes('리뷰를 검색 페이지로'), '데이터는 system 에 안 들어간다(지시와 데이터 분리)')
assert.ok(pr.user.includes('<diagnosis>') && pr.user.includes('<cases>') && pr.user.includes('사례 3 (잘 안 풀린 경우)') && pr.user.includes('[인용: 금지]'))
assert.ok(pr.user.includes('리뷰 페이지가 Google') && !pr.user.includes('SECRET QUOTE'), '인용 금지 소스의 번역 인용은 싣지 않는다')
assert.ok(pr.user.includes('단계 zero_rev') && pr.user.includes('출시 석 달째'), '진단의 단계·고객 이야기 요약')

// ── 파서 경계값 ──
const step = (n = 1) => ({ step: '리뷰 페이지 하나 만들기', from_case: n, why: '사례 1 이 검색 유입을 늘렸다' })
const good = { summary_for_you: '요약입니다.', do_this_week: [step(1), step(2), step(3)], dont_do: [{ avoid: '광고 대행', from_case: 3, why: '돈만 썼다' }, { avoid: 'x', from_case: 1, why: 'y' }], caveat: '단계가 다릅니다.' }
assert.ok(parseSynthesis(good, 3).ok, '할 일 3개·하지 말 것 2개 = 통과')
assert.ok(parseSynthesis(JSON.stringify(good), 3).ok, 'JSON 문자열도 받는다')
assert.ok(parseSynthesis({ ...good, do_this_week: [], dont_do: [] }, 3).ok, '0개도 된다(안 맞으면 줄인다)')
const bad = (o, n = 3) => parseSynthesis({ ...good, ...o }, n)
assert.match(bad({ do_this_week: [step(), step(), step(), step()] }).error, /4개\(최대 3\)/)
assert.match(bad({ dont_do: [good.dont_do[0], good.dont_do[0], good.dont_do[0]] }).error, /최대 2/)
assert.match(bad({ do_this_week: [step(0)] }).error, /범위 밖/); assert.match(bad({ do_this_week: [step(4)] }).error, /범위 밖/); assert.ok(bad({ do_this_week: [step(3)] }).ok)
assert.ok(!bad({ do_this_week: [{ step: '', from_case: 1, why: 'w' }] }).ok, '빈 step 실패')
assert.ok(!bad({ do_this_week: [{ step: 's', from_case: 1 }] }).ok, 'why 없음 실패')
assert.ok(!bad({ do_this_week: [{ step: 's', why: 'w' }] }).ok, 'from_case 없음 실패')
assert.ok(!bad({ do_this_week: [{ step: 's', from_case: 1.5, why: 'w' }] }).ok, 'from_case 정수 아님 실패')
assert.ok(bad({ summary_for_you: 'a'.repeat(SYNTH_LIMITS.summary) }).ok && !bad({ summary_for_you: 'a'.repeat(SYNTH_LIMITS.summary + 1) }).ok, '요약 길이 경계')
assert.ok(!bad({ summary_for_you: '  ' }).ok && !bad({ caveat: '' }).ok && !bad({ do_this_week: null }).ok && !bad({ dont_do: undefined }).ok)
assert.ok(!parseSynthesis(good, 0).ok && !parseSynthesis('not json', 3).ok && !parseSynthesis([], 3).ok)

// ── 근거 검사(사고 방지선) ──
const v = (o) => verifySynthesis({ ...good, do_this_week: [], dont_do: [], ...o }, P, D)
assert.ok(v({}).ok, '숫자·이름 없음 = 통과')
assert.ok(v({ summary_for_you: '사례 2 처럼 가입 40% 를 노릴 수 있고, 월 1,200명 검색 유입은 사례 1 입니다. Notion 과 Google 을 썼습니다.' }).ok, '사례에 있는 숫자·이름 + "사례 N" 참조는 통과')
assert.ok(v({ caveat: '월 9,900원 요금이라 단계가 다릅니다.' }).ok, '진단에 있는 숫자는 근거')
assert.deepEqual(v({ summary_for_you: '전환율이 30% 오릅니다.' }).unsupported, ['숫자 "30"'], '지어낸 숫자를 잡는다')
assert.ok(!v({ do_this_week: [{ step: '하루 5명에게 연락', from_case: 1, why: 'w' }] }).ok, '할 일 속 지어낸 횟수도 잡는다')
assert.ok(!v({ summary_for_you: '1 명' }).ok, '"1.2" 같은 다른 숫자의 일부는 근거가 아니다(낱개 숫자로 비교)')
assert.deepEqual(v({ dont_do: [{ avoid: 'Zapier 로 자동화', from_case: 2, why: 'w' }] }).unsupported, ['이름 "Zapier"'], '지어낸 도구 이름을 잡는다')
assert.ok(!v({ summary_for_you: '네이버 플레이스에 올리세요.' }).ok, '지어낸 한국 플랫폼 이름도 잡는다')
assert.ok(!v({ summary_for_you: 'SECRET 을 보세요' }).ok, '인용 금지 소스의 번역 문장은 근거로 쓰지 않는다')
assert.ok(!verifySynthesis({ ...good, summary_for_you: '월 9,900원' }, P).ok, '진단을 안 넘기면 사례 글만 근거')

// ── synthesize ──
class StopRun extends Error {}
assert.equal((await synthesize(D, [], async () => good)).status, 'skipped', '사례 없음 = 합성 안 함')
assert.equal((await synthesize(D, P, async () => ({ ...good, do_this_week: [], dont_do: [] }))).status, 'ok')
assert.equal((await synthesize(D, P, async () => { throw new Error('cli 실패') })).status, 'failed')
assert.equal((await synthesize(D, P, async () => ({ ...good, caveat: '' }))).status, 'failed', '형식 오류 = 실패')
const un = await synthesize(D, P, async () => ({ ...good, do_this_week: [], dont_do: [], summary_for_you: '매출이 3배 됩니다' }))
assert.ok(un.status === 'unsupported' && un.unsupported[0] === '숫자 "3"')
await assert.rejects(synthesize(D, P, async () => { throw new StopRun('quota') }), StopRun, '한도 오류는 멈춤')

// ── 평가 패킷 --synth ──
const here = (p) => fileURLToPath(new URL(p, import.meta.url))
const fxCards = (p) => JSON.parse(readFileSync(here(p), 'utf8')).cards
const cards = [...fxCards('../fixtures/story-flow/cards.json'), ...fxCards('../fixtures/story-flow/topic-cards.json')]
const loaders = { flowCards: async (ch) => cards.filter((c) => c.chapter === ch && c.weight >= 30) }
const now = new Date('2026-11-20T00:00:00Z')
const legacy = async (i) => (i.category.startsWith('리뷰') ? [{ name: 'Acme Legacy Corp', what: '리뷰 답글을 자동으로 달았다 → 별점이 올랐다', why: '같은 리뷰 관리 도구다' }] : [])
const DX = [
  { id: 'syn-5', area: '5', has_pitch: true, name: '가상 리뷰가게', pitch: '소상공인 가게 리뷰 관리 SaaS, 월 9,900원 구독', url: 'https://www.example-reviewpal.test', business_model: '월 구독',
    bottleneck: 'AWARENESS', situation: { stage: 'zero_rev', customer: 'smb' }, adversity_text: '검색 노출이 없어 손님이 안 온다', customer_story: '출시 석 달째인데 가입이 거의 없다.' },
  { id: 'syn-2', area: '2', has_pitch: false, name: '가상 영업도우미', pitch: '소상공인용 영업 도우미', url: 'https://example-salesmate.test',
    bottleneck: '써 보고 돈은 안 낸다', situation: { stage: 'early_rev' }, adversity_text: '무료 체험 뒤 유료 전환이 안 된다', customer_story: '체험은 하는데 결제를 안 한다.' },
]
// 가짜 합성기: 사례 1의 행동 글을 그대로 할 일로(근거 안). 호출마다 입력을 기록한다.
const calls = []
const fake = async ({ system, user }) => {
  calls.push({ system, user })
  const act = (user.match(/- 행동: (.+)/) ?? [])[1] ?? '사례를 다시 읽기'
  return { summary_for_you: '이 사례들은 지금 막힌 곳과 닿아 있습니다.', do_this_week: [{ step: act.slice(0, 150), from_case: 1, why: '사례 1 에 나온 행동입니다' }], dont_do: [], caveat: '단계가 다를 수 있습니다.' }
}
const off = await buildPack({ diagnoses: DX, seed: 7, variants: ['base', 'topic'], loaders, legacy, now })
const on = await buildPack({ diagnoses: DX, seed: 7, variants: ['base', 'topic'], loaders, legacy, now, synth: fake })
assert.deepEqual(on.key.diagnoses.map((d) => d.panels), off.key.diagnoses.map((d) => d.panels), '합성 켜도 칸 글자·배치는 같다(난수 안 씀)')
assert.equal((await buildPack({ diagnoses: DX, seed: 7, variants: ['base', 'topic'], loaders, legacy, now, synth: null })).packet.packet_id, off.packet.packet_id, '합성 꺼짐 = 기존 패킷 그대로')
assert.ok(!off.packet.instructions.some((s) => /이번 주 할 일/.test(s)) && on.packet.instructions.some((s) => /이번 주 할 일/.test(s)), '합성 안내는 켤 때만')
assert.ok(calls.every((c) => c.system === SYNTH_SYSTEM), '모든 칸 같은 프롬프트')
const nonEmpty = on.packet.diagnoses.flatMap((d) => d.panels).filter((p) => p.items.length)
assert.equal(calls.length, nonEmpty.length, '사례 있는 칸마다 한 번(빈 칸은 부르지 않는다)')
for (const d of on.packet.diagnoses) for (const p of d.panels) {
  const kind = on.key.diagnoses.find((k) => k.id === d.id).panels[p.label]
  if (!p.items.length) { assert.ok(p.markdown.includes('(제시된 사례 없음)') && !p.markdown.includes('이 고객에게') && p.for_you === null, `빈 칸(${kind})은 합성 없이`); continue }
  for (const h of ['**이 고객에게(요약)**', '**이번 주 할 일**', '**하지 말 것**', '**주의**: ']) assert.ok(p.markdown.includes(h), `${kind} 칸에 ${h}`)
  assert.ok(p.for_you && p.markdown.includes('(사례 1) — '), `${kind} 칸 할 일에 인용 번호`)
}
assert.ok(on.key.diagnoses.find((k) => k.id === 'syn-2').notes.synth.legacy.status === 'skipped', '기존 경로가 비면 합성하지 않고 key 에 skipped')
assert.equal(on.key.synth.enabled, true); assert.equal(off.key.synth.enabled, false)
// 블라인드 — 경로·플래그·합성 단어가 채점자 파일에 안 샌다
const txt = JSON.stringify(on.packet) + packetMarkdown(on.packet)
for (const w of ['legacy', 'story_flow', 'story flow', 'stageFirst', 'topic', 'synth', '합성', 'STORY_FLOW', 'variant', 'base', 'control', '대조', 'Acme', 'fxt-', 'fx-sales', 'slug', 'quote_allowed', 'src', 'unsupported'])
  assert.ok(!txt.includes(w), `채점자 파일에 "${w}" 없음`)
// 근거 검사 실패·호출 실패 → 그 칸만 원래 모양, key 에 기록
let n = 0
const flaky = async (o) => { n++; if (n === 1) return { ...(await fake(o)), summary_for_you: 'Zapier 로 매출 3배' }; if (n === 2) throw new Error('cli 실패 code=1'); return fake(o) }
const fl = await buildPack({ diagnoses: DX, seed: 7, variants: ['topic'], loaders, legacy, now, synth: flaky })
const st = fl.key.diagnoses.flatMap((k) => Object.values(k.notes.synth).map((s) => s.status))
assert.ok(st.includes('unsupported') && st.includes('failed') && st.includes('ok'))
assert.ok(fl.problems.some((p) => /합성 버림\(근거 없는 숫자 "3"·이름 "Zapier"\)/.test(p)) && fl.problems.some((p) => /합성 실패: 호출 실패/.test(p)), 'problems 에 기록')
const bareCount = fl.packet.diagnoses.flatMap((d) => d.panels).filter((p) => p.items.length && !p.markdown.includes('이 고객에게')).length
assert.equal(bareCount, 2, '실패 두 칸은 합성 없이 원래 모양')
assert.ok(!JSON.stringify(fl.packet).includes('Zapier'), '버린 합성은 패킷에 안 나간다')
await assert.rejects(buildPack({ diagnoses: DX, seed: 7, loaders, legacy, now, synth: async () => { throw new StopRun('quota') } }), StopRun)
// 합성 입력: src 없는 칸(기존 경로·일반론)은 보이는 글만, 새 경로 칸은 기준 에피소드 행동·결과(+인용 허용일 때만 번역)
assert.deepEqual(synthPick({ what: 'w', fail: 'negative', quote: null }), { action: 'w', failed: true, quote_ko: null, quote_allowed: false })
const newUser = calls.map((c) => c.user).find((u) => u.includes('[인용: 허용]'))
assert.ok(newUser && /- 결과: /.test(newUser), '새 경로 칸은 행동·결과·인용 번역이 실린다')
assert.ok(renderPanel('Z', [], { summary_for_you: 's', do_this_week: [], dont_do: [], caveat: 'c' }).includes('(제시된 사례 없음)') && !renderPanel('Z', [], { summary_for_you: 's', do_this_week: [], dont_do: [], caveat: 'c' }).includes('이 고객에게'))

// ── 문장·낱말 경계 자르기(잘림 수정) ──
const words = '가게 리뷰를 모아 검색 페이지로 만들었고 손님이 그 페이지로 들어와 예약까지 이어졌다 '.repeat(6)
const raw200 = words.slice(0, LABEL_CLIP)   // 옛 저장본: 200자에서 낱말 중간으로 잘림
const healed = healClip(raw200)
assert.ok(healed.length < LABEL_CLIP && (healed.endsWith('…') || /다$/.test(healed)) && words.replace(/\s+/g, ' ').startsWith(healed.replace(/…$/, '')), '옛 200자 잘림을 경계로 다시 자른다')
assert.equal(healClip('짧은 문장이다'), '짧은 문장이다'); assert.equal(healClip(null), null)
const full = 'x'.repeat(LABEL_CLIP - 1) + '다'; assert.equal(healClip(full), full, '문장 끝으로 끝나면 그대로')
assert.equal(clipText('Revenue hit $1.2k in month two and kept growing fast', 30), 'Revenue hit $1.2k in month…', '낱말 경계 + $1.2k 안 쪼갬')
const q = 'First sentence here. Second sentence is longer than the rest. Third.'
assert.equal(clipSentences(q, 25), 'First sentence here.', '인용 원문은 문장 단위로만')
assert.equal(clipSentences('One very long sentence without any break at all', 10), 'One very long sentence without any break at all', '한 문장도 안 들어가면 자르지 않는다')
const cl = caseLine({ company: 'C', key_decision: '첫 고객 열 명에게 직접 전화를 걸어 무엇이 불편한지 묻고 그 답으로 온보딩 화면을 다시 만들었다 그리고 가격표도 고쳤다 그 뒤 체험 전환율이 올랐다 '.repeat(2), outcome: null, grade: 'A' })
const atBoundary = (cut, orig) => { const t = orig.replace(/\s+/g, ' ').trim(), c = cut.replace(/…$/, ''); return t.startsWith(c) && (t.length === c.length || t[c.length] === ' ') }
assert.ok(cl.what.length <= 110 && atBoundary(cl.what, cl.what) && atBoundary(cl.what, '첫 고객 열 명에게 직접 전화를 걸어 무엇이 불편한지 묻고 그 답으로 온보딩 화면을 다시 만들었다 그리고 가격표도 고쳤다 그 뒤 체험 전환율이 올랐다 '.repeat(2)), '기존 경로 what 도 문장·낱말 경계(110자)')
const cl2 = caseLine({ company: 'C', key_decision: 'onboarding-'.repeat(5) + ' ' + 'abcdefghij '.repeat(12), outcome: 'failure', grade: 'A' })
assert.ok(cl2.what.startsWith('[failure] ') && cl2.what.endsWith('…') && atBoundary(cl2.what.slice(10), 'onboarding-'.repeat(5) + ' ' + 'abcdefghij '.repeat(12)), '문장 끝이 없으면 낱말 경계 + …')
const ps = pickSimilar({ picks: [{ i: 0, why: '같은 소상공인 손님이고 월 구독 과금이며 판매 채널도 네이버 검색으로 같고 가게 주인이 혼자 운영한다는 점까지 같아서 비슷합니다' }] }, [{ name: 'C', what: 'w' }], 3)
const W60 = '같은 소상공인 손님이고 월 구독 과금이며 판매 채널도 네이버 검색으로 같고 가게 주인이 혼자 운영한다는 점까지 같아서 비슷합니다'
assert.ok(ps[0].why.length <= 60 && ps[0].why.length < W60.length && atBoundary(ps[0].why, W60), '기존 경로 why 도 문장·낱말 경계(60자)')

console.log('story-flow-synthesis-selftest: 통과')
