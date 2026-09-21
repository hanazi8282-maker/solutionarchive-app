// 처방 카드 관련성 게이트 셀프테스트 — 픽스처만 쓴다(네트워크·DB 없음).
//   node scripts/remedy-gate-selftest.mjs
//
// 지키는 것
//   1) 무관(0) 카드만 빠진다. 1·2 는 남고, 판정이 없거나 NULL 이면 "미검증" 으로 남는다.
//   2) **미검증을 버리지 않는다.** 확인 불가를 관련 없음으로 접으면 카드가 조용히 사라진다(§7.1).
//   3) 카드 문장이 바뀌면(지문 불일치) 옛 판정을 쓰지 않는다 — 다시 미검증이다.
//   4) 1장 이상 있었는데 전부 무관이면 그 속성은 no_match 다("조회 못 함"이 아니다).
//   5) mock 프로바이더는 판정을 흉내내지 않는다 — 전부 null 이다. 가짜 2 를 만들면 그 위에 판단을 쌓게 된다.
//   6) 모델 응답 파싱: 코드블록·껍데기 객체를 견디고, 빠진 id 는 null 이지 0 이 아니다.

import { buildRemedies } from '../lib/cases/remedy.ts'
import { applyGate, cardFingerprint, cardIdOf, cardLine } from '../lib/cases/remedy-gate.ts'
import { buildJudgePrompt, judgeAspect, parseJudgeArray } from '../lib/cases/remedy-judge.ts'

let pass = 0, fail = 0
const t = (name, got, want) => { if (Object.is(got, want)) pass++; else { fail++; console.log(`FAIL  ${name}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`) } }

// ── 픽스처 (remedy-selftest 와 같은 모양) ─────────────────────
const project = { market: '탈모 샴푸', product_elevator_pitch: '두피 진정 샴푸' }
const studies = [
  { id: 's1', slug: 'acme', brand_name: '두피랩', bottleneck: 'TRUST', business_model: 'D2C', buyer_type: 'B2C', price_band: 'MID', review_status: 'approved' },
]
const moves = [
  { id: 'm1', case_study_id: 's1', lever: 'CONTENT', claim: '두피 가려움 리뷰를 상세페이지에 그대로 붙였다', evidence_grade: 'A', fact_check_grade: 'B', outcome_direction: 'positive', review_status: 'approved' },
  { id: 'm2', case_study_id: 's1', lever: 'OFFER', claim: '가려움 개선 안 되면 환불', evidence_grade: 'B', fact_check_grade: 'C', outcome_direction: 'positive', review_status: 'approved' },
]
const failedAngles = [
  { case_key: 'f1', product_category: '샴푸', claimed_angle: '가려움 즉시 사라짐', outcome: '과장광고로 제재', evidence_source: 'x', source_tier: 'primary', is_estimate: false },
]
const principles = [
  { sp_id: 'SP-001', tags: ['가려움', '샴푸', 'seller'], statement: '가려움은 증상이지 원인이 아니다', evidence_grade: 'A', evidence_grade_note: null, source_ref: 'docs' },
]
const corpora = { principles, studies, moves, failedAngles }
const aspects = [{ id: 'a1', name: '가려움', notes: '두피 가려움 불만이 반복된다', importance: 9, satisfaction: 2 }]

const base = buildRemedies({ aspects, project, corpora })
t('픽스처 전제 — 게이트 전에는 matched', base.cards[0].status, 'matched')
const card0 = base.cards[0]
const before = card0.fixes.length + card0.failures.length + card0.principles.length

/** 카드 한 장에 대한 판정 행을 만든다. text 를 주면 지문을 그 문장으로 계산한다(불일치 시험용). */
const row = (kind, card, verdict, textOverride) => ({
  aspect_id: 'a1',
  card_kind: kind,
  card_id: cardIdOf(kind, card),
  card_fingerprint: cardFingerprint(kind, textOverride ?? cardLine(kind, card)),
  verdict,
  human_verdict: null,
})

// ── 1. kept / removed / unverified ───────────────────────────
const mixed = applyGate(base, [
  row('case_move', card0.fixes[0], 2),
  row('case_move', card0.fixes[1], 0),
  row('failed_angle', card0.failures[0], 1),
  // 원칙 카드는 판정 행이 없다 → 미검증
])
const m = mixed.cards[0]
t('무관(0) 카드는 목록에서 빠진다', m.fixes.length, 1)
t('직접(2)은 남고 gate=kept', m.fixes[0].gate, 'kept')
t('부분(1)도 남는다', m.failures.length, 1)
t('판정 행이 없으면 미검증으로 남는다(버리지 않는다)', m.principles[0].gate, 'unverified')
t('요약 — 판정 받은 장수', m.gate_summary.judged, 3)
t('요약 — 제외 장수', m.gate_summary.removed, 1)
t('요약 — 미검증 장수', m.gate_summary.unverified, 1)
t('카드 문장은 게이트가 손대지 않는다', m.fixes[0].claim, card0.fixes[0].claim)
t('전부 빠지지 않았으면 상태는 matched 그대로', m.status, 'matched')

// ── 2. verdict NULL = 미검증 (0 이 아니다) ───────────────────
const nullVerdict = applyGate(base, [row('case_move', card0.fixes[0], null)])
t('verdict NULL 은 무관이 아니라 미검증', nullVerdict.cards[0].fixes[0].gate, 'unverified')
t('verdict NULL 카드는 사라지지 않는다', nullVerdict.cards[0].fixes.length, card0.fixes.length)

// ── 3. 지문 불일치 = 미검증 ──────────────────────────────────
const stale = applyGate(base, [row('case_move', card0.fixes[0], 0, '문구가 바뀌기 전의 옛 문장')])
t('지문이 어긋난 판정은 쓰지 않는다 — 카드가 살아 있다', stale.cards[0].fixes.length, card0.fixes.length)
t('지문 불일치는 미검증', stale.cards[0].fixes[0].gate, 'unverified')

// ── 4. 사람 판정이 LLM 판정을 이긴다 ─────────────────────────
const human = applyGate(base, [{ ...row('case_move', card0.fixes[0], 2), human_verdict: 0 }])
t('human_verdict=0 이면 LLM 이 2 라도 뺀다', human.cards[0].fixes.length, card0.fixes.length - 1)

// ── 5. 전부 무관 → no_match (not_run 이 아니다) ──────────────
const allZero = applyGate(base, [
  ...card0.fixes.map((c) => row('case_move', c, 0)),
  ...card0.failures.map((c) => row('failed_angle', c, 0)),
  ...card0.principles.map((c) => row('principle', c, 0)),
])
t('전부 무관이면 속성은 no_match', allZero.cards[0].status, 'no_match')
t('전부 무관이어도 not_run 이 아니다', allZero.cards[0].status === 'not_run', false)
t('no_match 사유에 원래 장수를 적는다', allZero.cards[0].reason, `낱말로 걸린 ${before}장을 재검사했더니 전부 무관 — 관련 사례 없음`)
t('전체 상태도 no_match 로 내려간다', allZero.status, 'no_match')

// ── 6. not_run 은 건드리지 않는다 ────────────────────────────
const notRun = buildRemedies({
  aspects, project,
  corpora: { principles: null, studies: null, moves: null, failedAngles: null },
})
t('전제 — 코퍼스 조회 실패는 not_run', notRun.status, 'not_run')
t('게이트가 not_run 을 no_match 로 바꾸지 않는다', applyGate(notRun, []).status, 'not_run')
t('not_run 속성 카드도 그대로', applyGate(notRun, []).cards[0].status, 'not_run')

// ── 7. 판정 행이 하나도 없으면 아무것도 빠지지 않는다 ────────
const none = applyGate(base, [])
t('판정 캐시가 비면 카드는 전부 남는다', none.cards[0].fixes.length + none.cards[0].failures.length + none.cards[0].principles.length, before)
t('판정 캐시가 비면 전부 미검증', none.cards[0].gate_summary.unverified, before)
t('판정 캐시가 비면 제외 0', none.cards[0].gate_summary.removed, 0)

// ── 8. 판정 프롬프트 ─────────────────────────────────────────
const judgeCards = [
  { kind: 'case_move', card_id: 'm1', text: cardLine('case_move', card0.fixes[0]) },
  { kind: 'failed_angle', card_id: 'f1', text: cardLine('failed_angle', card0.failures[0]) },
  { kind: 'principle', card_id: 'SP-001', text: cardLine('principle', card0.principles[0]) },
]
const prompt = buildJudgePrompt({ name: '가려움', notes: '두피 가려움' }, judgeCards)
t('라벨은 코퍼스별로 매겨진다', prompt.labels.join(','), 'A1,B1,C1')
t('프롬프트에 속성 이름이 들어간다', prompt.user.includes('속성: 가려움'), true)
t('프롬프트에 카드 문장이 그대로 들어간다', prompt.user.includes(judgeCards[0].text), true)
t('판정 기준 3단계를 명시한다', /직접 관련/.test(prompt.system) && /부분 관련/.test(prompt.system) && /무관/.test(prompt.system), true)
t('실물 소비재 셀러 맥락을 명시한다', /물리적 제품/.test(prompt.system), true)

// ── 9. 응답 파싱 관용도 ──────────────────────────────────────
t('맨 배열', parseJudgeArray('[{"id":"A1","rel":2}]')[0].rel, 2)
t('코드블록', parseJudgeArray('```json\n[{"id":"A1","rel":0}]\n```')[0].rel, 0)
t('앞뒤 잡텍스트', parseJudgeArray('판정 결과다:\n[{"id":"A1","rel":1}]\n끝.')[0].rel, 1)
t('껍데기 객체', parseJudgeArray('{"verdicts":[{"id":"A1","rel":2}]}')[0].rel, 2)
t('JSON 이 아니면 null (빈 배열이 아니다)', parseJudgeArray('판정을 못 하겠다'), null)

// ── 10. judgeAspect — 주입한 호출로 파싱 경로 확인 ───────────
const prevProvider = process.env.LLM_PROVIDER
process.env.LLM_PROVIDER = 'gemini'
const call = (text) => async () => ({ text, model: 'fake-judge' })

const ok = await judgeAspect({ name: '가려움', notes: null }, judgeCards, call('[{"id":"A1","rel":2},{"id":"B1","rel":0}]'))
t('응답에 있는 라벨은 그 값', ok.verdicts.map((v) => v.verdict).join(','), '2,0,')
t('응답에 없는 라벨은 null (무관이 아니다)', ok.verdicts[2].verdict, null)
t('카드 id 를 라벨이 아니라 원래 id 로 돌려준다', ok.verdicts[0].card_id, 'm1')
t('모델명을 남긴다', ok.model, 'fake-judge')

const extra = await judgeAspect({ name: '가려움', notes: null }, judgeCards, call('[{"id":"A1","rel":1},{"id":"Z9","rel":2}]'))
t('응답에만 있는 라벨은 버린다', extra.verdicts.length, 3)

const broken = await judgeAspect({ name: '가려움', notes: null }, judgeCards, call('모르겠다'))
t('파싱 실패는 전부 null (0 으로 접지 않는다)', broken.verdicts.every((v) => v.verdict === null), true)

const thrown = await judgeAspect({ name: '가려움', notes: null }, judgeCards, async () => { throw new Error('429') })
t('호출 실패도 전부 null — 던지지 않는다', thrown.verdicts.every((v) => v.verdict === null), true)

const badRel = await judgeAspect({ name: '가려움', notes: null }, judgeCards, call('[{"id":"A1","rel":5}]'))
t('0/1/2 가 아닌 값은 null', badRel.verdicts[0].verdict, null)

// ── 11. mock 프로바이더 — 가짜 판정을 만들지 않는다 ──────────
process.env.LLM_PROVIDER = 'mock'
const mock = await judgeAspect({ name: '가려움', notes: null }, judgeCards)
t('mock 은 전부 미검증', mock.verdicts.every((v) => v.verdict === null), true)
t('mock 은 모델명을 mock 으로 남긴다', mock.model, 'mock')
const mockCalled = await judgeAspect({ name: '가려움', notes: null }, judgeCards, call('[{"id":"A1","rel":2}]'))
t('mock 이면 주입된 호출이 있어도 판정하지 않는다', mockCalled.verdicts.every((v) => v.verdict === null), true)
t('mock 판정을 게이트에 먹여도 카드가 사라지지 않는다',
  applyGate(base, mock.verdicts.map((v, i) => ({
    aspect_id: 'a1', card_kind: v.card_kind, card_id: v.card_id,
    card_fingerprint: cardFingerprint(v.card_kind, judgeCards[i].text), verdict: v.verdict,
  }))).cards[0].fixes.length, card0.fixes.length)
if (prevProvider === undefined) delete process.env.LLM_PROVIDER
else process.env.LLM_PROVIDER = prevProvider

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) process.exit(1)
console.log('무관만 빠지고, 미검증은 남고, 전부 무관이면 no_match 다. mock 은 판정을 흉내내지 않는다.')
