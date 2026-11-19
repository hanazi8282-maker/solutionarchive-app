#!/usr/bin/env node
// rr-v2 평가 하네스 순수 부품 셀프테스트 — gold·채점·재확인 추출·옛 프롬프트 일치. 네트워크·DB·LLM 없음.
//   node scripts/t2-approval-eval-selftest.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { EVAL_GATE, goldOf, predictA, scoreEval, verdictAgreement } from '../lib/analysis/t2-approval-eval.ts'
import { INFORMATIVE_EXAMPLE_INPUT_IDS, RR39_NARROW_IRRELEVANT_INPUT_IDS } from '../lib/analysis/relevance-criteria.ts'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
let pass = 0, fail = 0
const ok = (cond, name) => { if (cond) pass++; else { fail++; console.error(`✗ ${name}`) } }

const T = '2026-09-28T01:00:00Z'
const R = { verdict: 'relevant', product_informative: true }
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const row = (n, hv, hi, first = R, second = R) => ({ input_id: id(n), human_verdict: hv, human_product_informative: hi, human_graded_at: hv ? T : null, first, second })

// gold — 정보 열 있으면 감사 킬스위치 잣대, 없으면 관련=true 추정
const g = (x) => (x === null ? null : `${x.value}${x.estimated ? '~' : ''}`)
ok(g(goldOf(row(1, 'relevant', true))) === 'true', 'gold: 관련∧정보 → true(확정)')
ok(g(goldOf(row(1, 'relevant', false))) === 'false' && g(goldOf(row(1, 'irrelevant', true))) === 'false', 'gold: 정보 없음·무관 → false')
ok(g(goldOf(row(1, 'relevant', null))) === 'true~', 'gold: 관련 ∧ 정보 빔 → true 추정')
ok(g(goldOf(row(1, 'irrelevant', null))) === 'false', 'gold: 무관 ∧ 정보 빔 → false(확정)')
ok(goldOf(row(1, 'unknown', null)) === null && goldOf(row(1, 'unknown', true)) === null && goldOf(row(1, null, null)) === null, 'gold: 모름·미채점 → null')
const narrow = RR39_NARROW_IRRELEVANT_INPUT_IDS[0]
ok(goldOf({ ...row(1, 'irrelevant', null), input_id: narrow }) === null && goldOf({ ...row(1, 'relevant', null), input_id: narrow }) === null, 'gold: 좁은 기준 8건은 재확인(정보 열) 전 미정')
ok(g(goldOf({ ...row(1, 'relevant', true), input_id: narrow })) === 'true', 'gold: 좁은 기준 8건도 재확인 뒤엔 믿는다')

// 예측
ok(predictA(R, R) === true, 'A: 둘 다 관련∧정보')
ok(predictA(R, { verdict: 'relevant', product_informative: null }) === false && predictA({ verdict: 'unknown', product_informative: true }, R) === false, 'A 아님: 정보 null·1차 unknown')
ok(predictA(null, R) === null && predictA(R, null) === null, '판정 없음 → 예측 불가(null)')

// 채점
const X = { verdict: 'irrelevant', product_informative: false }
const rows = [
  row(1, 'relevant', true), row(2, 'relevant', true), row(3, 'relevant', true, R, X), // 양성 3, A 2
  row(4, 'relevant', false),                                                         // A 인데 정보 없음 → 오류
  row(5, 'irrelevant', true, X, X),                                                  // 음성·not A
  row(6, 'unknown', null),                                                           // gold 없음 + A → 재확인 a
  row(7, null, null, R, X),                                                          // 사람 없음·not A → 재확인 아님
  row(8, 'relevant', true, null, R),                                                 // 판정 빠짐
  { ...row(9, 'relevant', true), input_id: INFORMATIVE_EXAMPLE_INPUT_IDS[1] },       // 예시(#13) — 채점 제외
]
const r = scoreEval(rows)
ok(r.excluded_examples === 1, `예시 id 제외 1 (실제 ${r.excluded_examples})`)
ok(r.unjudged === 1, `판정 빠짐 1 (실제 ${r.unjudged})`)
ok(r.n_A === 3 && r.errors === 1, `n_A 3 · 오류 1 (실제 ${r.n_A}·${r.errors})`)
ok(Math.abs(r.precision - 2 / 3) < 1e-9 && Math.abs(r.recall - 2 / 3) < 1e-9, `정밀도·재현율 2/3 (실제 ${r.precision}·${r.recall})`)
const rc = new Map(r.recheck.map((x) => [x.input_id, x.reason]))
ok(rc.get(id(6)) === 'a' && !rc.has(id(7)) && !rc.has(INFORMATIVE_EXAMPLE_INPUT_IDS[1]), '재확인 a: 사람 모름인데 A, 예시는 빼고')
// v71cu P3: few-shot 으로 실린 id 도 채점에서 뺀다
const fs1 = scoreEval(rows, new Set([id(4)]))
ok(fs1.excluded_examples === 2 && fs1.errors === 0 && fs1.n_A === 2, `few-shot id 제외: 예시 2 · A 2 · 오류 0 (실제 ${fs1.excluded_examples}·${fs1.n_A}·${fs1.errors})`)
ok(r.gold_estimated === 0, `정보 열 채운 행만 A → 추정 0 (실제 ${r.gold_estimated})`)

// 회귀(09-28 실데이터 A 0 · 재확인 57): 사람 정보 열이 전부 NULL 이어도 채점된다. 재확인은 부딪치는 행만.
const nul = scoreEval([
  row(11, 'relevant', null), row(12, 'relevant', null),       // A ∧ 관련 → 추정 정답, 재확인 아님
  row(13, 'irrelevant', null),                                 // A ∧ 무관 → 오류, 재확인 a
  row(14, 'unknown', null),                                    // A ∧ 모름 → 미정, 재확인 a
  row(15, 'relevant', null, R, X),                             // not A ∧ 관련 → 재확인 c
  row(16, 'irrelevant', null, X, X),                           // not A ∧ 무관 → 일치, 재확인 아님
  row(17, null, null, X, X),                                   // 사람 없음 → 재확인 아님
  { ...row(18, 'irrelevant', null, X, X), input_id: narrow },  // 좁은 8건 → 미정, b
])
const nrc = new Map(nul.recheck.map((x) => [x.input_id, x.reason]))
ok(nul.n_A === 3 && nul.errors === 1 && nul.gold_estimated === 2, `정보 열 전부 NULL: n_A 3 · 오류 1 · 추정 2 (실제 ${nul.n_A}·${nul.errors}·${nul.gold_estimated})`)
ok(Math.abs(nul.recall - 2 / 3) < 1e-9, `정보 열 전부 NULL: 재현율 2/3 (실제 ${nul.recall})`)
ok(nrc.get(id(13)) === 'a' && nrc.get(id(14)) === 'a' && nrc.get(id(15)) === 'c' && nrc.get(narrow) === 'b', '재확인: 부딪치는 행 a·c + 좁은 b')
ok(nul.recheck.length === 3 + RR39_NARROW_IRRELEVANT_INPUT_IDS.length, `재확인 = 부딪치는 3 + 좁은 8 (실제 ${nul.recheck.length})`)
ok(RR39_NARROW_IRRELEVANT_INPUT_IDS.every((x) => nrc.get(x) === 'b'), '정보 열 NULL 입력에서도 좁은 8건 항상 b')
ok(RR39_NARROW_IRRELEVANT_INPUT_IDS.every((x) => rc.get(x) === 'b'), '좁은 기준 8건은 표본에 없어도 항상 b 로 들어간다')
ok(RR39_NARROW_IRRELEVANT_INPUT_IDS.length === 8 && new Set(r.recheck.map((x) => x.input_id)).size === r.recheck.length, '8건·중복 없음')
ok(!r.meets_gate, '문턱 미달(n_A<40)')
// 회귀(2026-09-28): 좁은 8건을 다시 채점해 정보 열이 채워지면 재확인에서 빠져야 한다 — 끝난 행이 계속 올라오던 버그.
const done = scoreEval([{ ...row(19, 'relevant', true, X, X), input_id: narrow }])
ok(!done.recheck.some((x) => x.input_id === narrow) && done.recheck.length === RR39_NARROW_IRRELEVANT_INPUT_IDS.length - 1, `재채점 끝난 좁은 행은 재확인에서 빠진다 (실제 ${done.recheck.length})`)
const big = scoreEval([...Array(40)].map((_, i) => row(100 + i, 'relevant', true)))
ok(big.meets_gate && big.n_A === 40 && big.errors === 0, '40건 오류 0 재현율 100% → 문턱 충족')
const gap = scoreEval([...[...Array(40)].map((_, i) => row(200 + i, 'relevant', true)), row(300, 'relevant', true, null, R)])
ok(!gap.meets_gate, '판정 빠진 행이 있으면 문턱 판정을 하지 않는다(§7.1)')
ok(EVAL_GATE.minNA === 40 && EVAL_GATE.maxErrors === 2 && EVAL_GATE.minRecall === 0.5, '문턱 수치 n_A≥40·오류≤2·재현율≥50%')

// 옛 프롬프트 대비 1차 일치
const ag = verdictAgreement(new Map([['a', 'relevant'], ['b', 'irrelevant'], ['c', 'relevant']]), new Map([['a', 'relevant'], ['b', 'relevant']]))
ok(ag.n === 2 && ag.agree === 1 && ag.flips[0].input_id === 'b', '일치율은 양쪽에 다 있는 id 만, 바뀐 행을 돌려준다')

// 배선
const h = readFileSync(`${ROOT}scripts/t2-approval-eval.mjs`, 'utf8')
ok(h.includes('scoreEval(') && h.includes('verdictAgreement(') && !/[0-9a-f]{8}-[0-9a-f]{4}-4/.test(h), '하네스가 순수 부품을 쓴다(예시·재확인 id 는 lib 에서만)')
ok(h.includes("원문 ${raw.size}/${ids.length}건만 읽힘") && h.includes('process.exit(2)'), '원본 읽기 건수 불일치 → 비0 종료')
ok(h.includes("if (o.error)") && h.includes('캐시 안 함'), '호출 실패는 캐시하지 않는다')
// 순환·4바퀴 로직은 야간 2차와 같은 헬퍼다 — 하네스에 복사본이 다시 생기면 실패(동작 검사는 relevance-second-judge-selftest).
ok(h.includes('callGeminiRotating(') && !h.includes('round < 4'), '2차 503 모델 순환 4바퀴 = 공용 헬퍼')
ok(h.includes('firstOpts)') && h.includes('callGeminiRotating(secondInstructions,') && h.includes('loadRelevanceExamples(') && h.includes('scoreEval(evalRows, fewShotIds)'), 'v71cu P3: 1차 운영 옵션·2차 같은 기준 지시문·운영 few-shot 로더·예시 id 채점 제외')
ok(h.includes("opt('criteria') ?? 'v24'") && h.includes("opt('info') ?? 'v1'") && h.includes('infoVersionSuffix(info)') && h.includes('raw_text: raw.get(r.input_id) }, info)') && h.includes('--info v1 --local-claude --out ops/state/t2-eval/pr682-before.json') && h.includes('--info v2 --local-claude --out ops/state/t2-eval/pr682-after.json'), 'PR #682: 기본 = 운영 v24 · info v1(꺼짐), 캐시 키에 info 버전, 가드도 info 를 따름, 전/후 같은 표본 명령이 머리에 있다')
ok(!/\.(update|upsert|insert|delete)\(/.test(h), '하네스는 DB 에 쓰지 않는다')

// ── info-v23 후보(2026-11-20) — 규칙 a~f 키워드 · 정보약 처리 · 가상 B세트 회귀 · 배선 · C세트 원문 누설 ──
{
  const C = await import('../lib/analysis/relevance-criteria.ts')
  const { judgeRelevanceBatch, buildRelevancePrompt } = await import('../lib/analysis/relevance-judge.ts')
  const { secondOpinionInstructionsV24, validateOpinions } = await import('../lib/analysis/second-opinion.ts')
  const { meetsRrV2, passesRrV2ContentGuard } = await import('../lib/analysis/auto-approval.ts')
  const { outOfScopeReason, scopeOptionsFor } = await import('../lib/analysis/approval-scope.ts')
  const E = await import('../lib/analysis/t2-approval-eval.ts')
  const V23 = C.PRODUCT_INFORMATIVE_CRITERIA_V23
  const areas = ['① 회의록·통화 요약', '② 영업 도우미', '③ 마케팅 콘텐츠·광고 소재', '⑤ 글쓰기·문서·노트', '⑨ 디자인']
  const P = { product_elevator_pitch: '가상 프로젝트', business_model: 'SAAS' }
  const s1 = buildRelevancePrompt(P, [{ input_id: 'x', text: 't' }], [], { criteria: 'v24', areas, info: 'v23' }).system
  const s2 = C.withInfoCriteria(secondOpinionInstructionsV24(areas), 'v23')

  // (1) 규칙 a~f 가 1차·2차 프롬프트 텍스트에 들어 있다
  const RULES = {
    a: ['버그 리포트', '스택 트레이스·재현 단계', 'irrelevant 이고 info=false', '기능 요청이라도 그 기능을 쓰는 맥락', '대안 비교가 있으면 relevant 이고 info=true'],
    b: ['스치듯', '동작·품질·비용·기능', '이름만 있고 그런 사실이 없으면 info=false', '합법 마케팅 메일은 많이 받고 진짜 스팸은 거의 안 받는다'],
    c: ['경쟁사 직원', '포지셔닝', '제외하지 않고 promo=true 로 태그', '대상 제품을 판단할 정보가 없으면 정보약'],
    d: ['영역 밖(개인 습관·생활 앱', '"영역 밖:"', '배정 누락', '활성 영역 정의에 맞는지로 판단', '개발자 도구'],
    e: ['앱이 안 열린다', 'relevant 이고 정보약', '이유가 있는 불만·칭찬', '핵심 기능 칭찬과 쓰임새'],
    f: ['자사 홍보', '태그만 하고 내용으로 판정', '기능·가치를 설명하는 소개글은 relevant 이고 info=true', '디자인 도구는 영역 안'],
  }
  for (const [k, words] of Object.entries(RULES)) {
    const miss = words.filter((w) => !V23.includes(w) || !s1.includes(w) || !s2.includes(w))
    ok(miss.length === 0, `v23 규칙 (${k}) 키워드가 블록·1차(v24)·2차(v24) 프롬프트에 있다 ${miss.length ? `— 빠짐: ${miss.join(' / ')}` : ''}`)
  }
  ok(V23.includes('정보약 = info=false 이고 weak=true') && s1.includes('"promo":false,"weak":false}]') && s2.includes('product_informative=false 로 답하고 "weak":true'), 'v23: 정보약 = info=false + weak 태그(1차 출력 줄에 weak 키, 2차는 product_informative=false+weak)')
  ok(s1.includes('판정 기준 v2.4') && s1.indexOf('(17) ①은') < s1.indexOf('[info-v23 후보') && !s1.includes('[info-v2 추가'), 'v24 + v23: v2.4 본문 유지, v23 블록이 뒤에 오고 info-v2 블록은 없다')
  ok(C.parseInfoMode('v23').mode === 'v23' && C.parseInfoMode(undefined).mode === 'v1' && C.parseInfoMode('V23 ').mode === 'v23', 'INFO_CRITERIA=v23 로만 켜진다 · 기본 v1 그대로')
  ok(C.infoVersionSuffix('v23') === `+${C.INFO_CRITERIA_V23_VERSION}` && C.infoVersionSuffix('v1') === '' && C.INFO_CRITERIA_V23_VERSION !== C.INFO_CRITERIA_VERSION, 'prompt_version: v23 은 +info-v23cand 접미사, v1 은 옛 값 그대로')
  ok(C.withInfoCriteria(s2.replace(V23, C.PRODUCT_INFORMATIVE_CRITERIA), 'v1') === s2.replace(V23, C.PRODUCT_INFORMATIVE_CRITERIA), 'v1 은 글자 하나 안 바뀐다')
  let threw = false; try { C.withInfoCriteria('블록 없음', 'v23') } catch { threw = true }
  ok(threw, 'v23: 치환할 v1 블록이 없으면 던진다')

  // (2) 시험지 오염 방지(구조): v23 블록의 예시 줄은 전부 (가상), id·URL 없음, 예시 id 목록은 그대로 9건
  const added = V23.slice(V23.indexOf('[info-v23 후보'))
  const exLines = added.split('\n').filter((l) => /^(T|F|약) /.test(l))
  ok(exLines.length >= 5 && exLines.every((l) => l.includes('(가상)')), `v23 예시 ${exLines.length}줄 전부 (가상) 표시`)
  ok(!/[0-9a-f]{8}-[0-9a-f]{4}-/.test(added) && !/https?:\/\//.test(added), 'v23 추가 블록에 input_id·URL 없음(원문 출처 흔적 없음)')
  ok(C.INFORMATIVE_EXAMPLE_INPUT_IDS.length === 9, '예시로 실린 원문 id 는 늘지 않았다(9건 — v23 은 원문을 싣지 않는다)')

  // (3) C세트 원문 누설 — 원문은 공개 리포에 없다. 오케스트레이터가 리포 밖에 뽑은 파일(T2_CSET_TEXTS)로 대조한다. 없으면 확인 불가(통과 아님).
  const cPath = process.env.T2_CSET_TEXTS
  if (!cPath) console.warn('⚠️ C세트 원문 누설 검사: 확인 불가 — T2_CSET_TEXTS(리포 밖 원문 json) 없음. 통과로 세지 않는다.')
  else {
    const rows = JSON.parse(readFileSync(cPath, 'utf8'))
    const norm = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim()
    const hay = norm([V23, s1, s2, readFileSync(`${ROOT}lib/analysis/relevance-criteria.ts`, 'utf8'), readFileSync(`${ROOT}scripts/t2-approval-eval-selftest.mjs`, 'utf8'), readFileSync(`${ROOT}scripts/auto-approval-selftest.mjs`, 'utf8')].join('\n'))
    const sentences = rows.flatMap((r) => String(typeof r === 'string' ? r : r.text ?? '').split(/[.!?。\n]+/)).map(norm).filter((s) => s.length >= 20)
    const leaked = sentences.filter((s) => hay.includes(s))
    ok(rows.length > 0 && sentences.length > 0, `C세트 원문 파일을 읽었다(${rows.length}건 · 문장 ${sentences.length})`)
    ok(leaked.length === 0, `C세트 원문 문장이 프롬프트·테스트에 없다 ${leaked.length ? `— 누설 ${leaked.length}: ${leaked.slice(0, 2).join(' / ')}` : ''}`)
  }

  // (4) 가상 B세트 회귀 — 가짜 LLM 응답으로 파싱·정보약 내림·승인 경로를 고정(모델이 실제로 이렇게 답하는지는 --compare 재측정이 잰다)
  const B = [
    { name: '버그 리포트', source: 'github_issues', area: '5', text: 'Crash on save. Steps: open, type, save. TypeError at line 42. OS: Windows 11, v3.2.1. Logs attached below for reference.', rel: 'irrelevant', info: false, weak: false, promo: false, approve: false },
    { name: '맥락 있는 기능 요청', source: 'github_issues', area: '5', text: 'Need markdown export: we move meeting notes into our wiki weekly and tables break. The other editor handles this fine.', rel: 'relevant', info: true, weak: false, promo: false, approve: true },
    { name: '스치듯 이름 + 품질 사실', source: 'hackernews', area: '3', text: 'With that mail tool I get lots of legit marketing mail and almost no real spam in the inbox, which is all I care about.', rel: 'relevant', info: true, weak: false, promo: false, approve: true },
    { name: '이름만', source: 'hackernews', area: '3', text: 'Everyone seems to use that mail tool these days, I keep hearing the name at every single meetup I attend.', rel: 'relevant', info: false, weak: false, promo: false, approve: false },
    { name: '스토어 한 줄 증상(모순 응답 info=true·weak=true)', source: 'googleplay', area: 'work', text: '앱이 안 열려요. 업데이트 후로 계속 이래요. 빨리 고쳐 주세요. 일을 못 하고 있습니다 정말로요.', rel: 'relevant', info: true, weak: true, promo: false, approve: false },
    { name: '경쟁사 직원 포지셔닝', source: 'hackernews', area: '2', text: 'I work at a competing CRM vendor and honestly we are the number one choice for small teams, period, no contest.', rel: 'relevant', info: false, weak: true, promo: true, approve: false },
    { name: '영역 밖 습관 앱', source: 'appstore', area: 'out-founder', text: 'This habit tracker keeps my water intake streak going and the widget is cute, I check it every morning.', rel: 'irrelevant', info: false, weak: false, promo: false, approve: false },
  ]
  const reviews = B.map((b) => ({ input_id: b.name, text: b.text }))
  const fake = async () => ({ text: JSON.stringify(B.map((b, i) => ({ id: `R${i + 1}`, rel: b.rel, info: b.info, weak: b.weak, promo: b.promo, why: b.name }))), model: 'fake' })
  const o = await judgeRelevanceBatch(P, reviews, [], fake, { criteria: 'v24', areas, info: 'v23' })
  ok(o.verdicts.every((v, i) => v.verdict === B[i].rel && v.info_weak === B[i].weak && v.self_promo === B[i].promo), 'B(가상): rel·weak·promo 를 파싱이 그대로 싣는다')
  ok(o.verdicts[4].product_informative === false && o.verdicts[5].product_informative === false, '정보약은 info=true 로 답해도 false 로 내린다(안전 쪽)')
  ok(o.verdicts[0].product_informative === false && o.verdicts[1].product_informative === true && o.verdicts[2].product_informative === true, '버그=정보없음 · 맥락 기능 요청·스치듯 품질 사실=정보있음')
  const now = new Date().toISOString()
  const approvable = (b, v) => meetsRrV2({ verdict: v.verdict, second_verdict: v.verdict, product_informative: v.product_informative, second_product_informative: v.product_informative, judged_at: now })
    && outOfScopeReason(b.area, false, scopeOptionsFor('v23')) === null && passesRrV2ContentGuard({ source_key: b.source, raw_text: b.text }, 'v23')
  const got = B.map((b, i) => approvable(b, o.verdicts[i]))
  ok(got.every((g, i) => g === B[i].approve), `B(가상) 승인 후보: ${B.map((b, i) => `${b.name}=${got[i] ? '승인' : '제외'}`).join(' · ')}`)
  ok(outOfScopeReason('out-founder', false, scopeOptionsFor('v23')) === 'out-area' && outOfScopeReason('out-consumer', false, scopeOptionsFor('v23')) === 'out-area', 'v23: out-founder·out-consumer 는 승인 범위 밖(규칙 d) — v2 와 달리 out-founder 를 열지 않는다')
  ok(passesRrV2ContentGuard({ source_key: 'github_issues', raw_text: B[1].text }, 'v23') && !passesRrV2ContentGuard({ source_key: 'github_issues', raw_text: B[1].text }, 'v1'), 'v23 내용 가드: 출처 제외 없음(v2 와 같음), v1 은 github_issues 제외 그대로')
  const vo = validateOpinions({ rows: [{ input_id: 'a', verdict: 'relevant', product_informative: true, weak: true }, { input_id: 'b', verdict: 'relevant', product_informative: true }] })
  ok(vo.ok[0].product_informative === false && vo.ok[0].weak === true && vo.ok[1].product_informative === true && vo.ok[1].weak === undefined && vo.rejected.length === 0, '2차 검증: weak=true 면 product_informative=false, weak 없으면 그대로(거부하지 않음)')
  const rjs = readFileSync(`${ROOT}scripts/relevance-judge-auto.mjs`, 'utf8')
  ok(rjs.includes("mode === 'v23' && v.info_weak === true ? INFO_WEAK_TAG") && rjs.includes("mode !== 'v1' && v.self_promo === true ? PROMO_TAG") && C.INFO_WEAK_TAG === '[정보약]', '1차 기록: v23 정보약 → reason 끝 [정보약], promo 태그는 v2·v23')

  // (5) 평가 배선 부품
  ok(E.classifyFailure('claude 로컬 실패 exit=null SIGTERM') === 'b_time_quota' && E.classifyFailure('x', true) === 'b_time_quota' && E.classifyFailure('JSON 파싱 실패') === 'c_structure' && E.classifyFailure('응답에 없음') === 'c_structure' && E.classifyFailure('ENOENT') === 'd_other', 'classifyFailure: 시간·한도 b · 구조 c · 기타 d')
  const gp = E.parseGoldFile([{ input_id: 'g1', verdict: 'relevant', informative: true }, { input_id: 'g2', verdict: 'relevant', informative: 'weak' }, { input_id: 'g3', verdict: 'irrelevant', informative: null }])
  ok(gp.errors.length === 0 && gp.gold.get('g2').human_product_informative === false && gp.gold.get('g2').weak && gp.gold.get('g1').human_product_informative === true, 'gold: informative "weak" 는 승인하면 오류(false)로')
  ok(E.parseGoldFile([{ input_id: 'x', verdict: 'maybe' }, { input_id: 'y', verdict: 'relevant', informative: 'yes' }, { verdict: 'relevant' }]).errors.length === 3 && E.parseGoldFile({}).errors.length === 1, 'gold: 어휘 밖·id 없음·배열 아님은 오류(조용히 버리지 않는다)')
  const ip = E.parseIdsFile(['i1', { input_id: 'i2', project_id: 'p', set: 'C' }, 'i1', ''])
  ok(ip.ids.length === 2 && ip.ids[1].set === 'C' && ip.errors.length === 2 && E.parseIdsFile({ rows: ['z'] }).ids.length === 1, 'ids: 문자열·객체·{rows} 받음, 중복·빈 id 는 오류')
  const gw = scoreEval([row(400, 'relevant', false)])
  ok(gw.n_A === 1 && gw.errors === 1, 'gold 정보약(=false) 행을 승인하면 오류로 센다')
  const su = E.summarizeUnjudged([
    { input_id: 'u1', first: null, second: R }, { input_id: 'u2', first: R, second: null }, { input_id: 'u3', first: null, second: null },
    { input_id: 'u4', first: { verdict: 'unknown', product_informative: null, reason: null }, second: R },
  ], new Map([['u1', { cause: 'b_time_quota', detail: 't' }], ['u3', { cause: 'c_structure', detail: 'p' }]]), new Map([['u2', { cause: 'c_structure', detail: 'x' }], ['u3', { cause: 'b_time_quota', detail: 'q' }]]))
  ok(su.total_unjudged === 3 && su.by_cause.b_time_quota === 1 && su.by_cause.c_structure === 2 && su.by_pass.both === 1 && su.a_unknown.first_unknown === 1 && su.a_unknown.first_unknown_no_reason === 1, `원인 요약: 빠짐 3(b1·c2, 둘 다 1) · 모름은 따로 1 (실제 ${JSON.stringify(su.by_cause)})`)
  const mr = (id, a, gold, set = 'C') => ({ input_id: id, set, source_key: null, gold, a, a_guard: a, first_weak: null, second_weak: null, cause: null })
  const cm = E.compareModes([mr('m1', true, false), mr('m2', true, true), mr('m3', null, true), mr('m4', false, true)], [mr('m1', false, false), mr('m2', true, true), mr('m3', true, true), mr('m5', true, true)])
  ok(cm.both === 3 && cm.only_first_mode === 1 && cm.only_second_mode === 1 && cm.common_judged.n === 2 && cm.common_judged.err_a === 1 && cm.common_judged.err_b === 0 && cm.flips.length === 1 && cm.flips[0].input_id === 'm1', 'compareModes: 공통 판정 행만 지표, A 가 갈린 행 목록')
  const bs = E.bySet([mr('s1', true, false, 'A'), mr('s2', null, true, 'A'), mr('s3', true, true, 'C')])
  ok(bs.A.n === 2 && bs.A.errors === 1 && bs.A.unjudged === 1 && bs.C.n_A === 1, 'bySet: 세트별 A·오류·빠짐')
  ok(h.includes("INFO_MODES = ['v1', 'v2', 'v23']") && h.includes('parseIdsFile(') && h.includes('parseGoldFile(') && h.includes('compareModes(') && h.includes('unjudged_causes: unjudgedCauses') && h.includes("'--info', m, '--out', outs[m]") && h.includes('--dump-texts 는 리포 밖 경로만'), '하네스: --info v23 · --ids · --gold · --compare(모드별 자식) · 원인 필드 · 원문 덤프는 리포 밖만')
}

console.log(`\n${fail ? '❌' : '✅'} rr-v2 평가 하네스 셀프테스트: ${pass} pass / ${fail} fail`)
process.exit(fail ? 1 : 0)
