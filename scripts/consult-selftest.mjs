// 컨설팅 MVP 셀프테스트(v71ci) — 네트워크·DB 없이 도는 순수 함수만. 블록이 늘 때마다 이 파일에 케이스를 더한다.
import { normalizeCompanyUrl } from '../lib/consult/url.ts'
import { robotsDecision, htmlToText } from '../lib/consult/collect.ts'
import { validateCh1, computeEvidenceLevel } from '../lib/consult/report/ch1-validate.ts'
import { computeStage } from '../lib/consult/runs.ts'
import { findStatViolations } from '../lib/consult/report/stat-lint.ts'
import { costUsd } from '../lib/consult/cost.ts'
import { validateL1, parseUserNumbers, explainLossDivergence } from '../lib/consult/report/ch1-l1-validate.ts'
import { sanitizeCaseQuery, caseLine } from '../lib/consult/cases-validate.ts'
import { validateCh2 } from '../lib/consult/report/ch2-validate.ts'
import { parseStep, validateToolArgs, recalcLoss } from '../lib/consult/agent-validate.ts'
import { pickMode, buildRoiCard, validateUnknownFacts } from '../lib/consult/measure-validate.ts'
import { addMonth, cleanDepositor } from '../lib/consult/period.ts'
import { isActive } from '../lib/consult/entitlement.ts'
import { validateCh3to6 } from '../lib/consult/report/ch3to6-validate.ts'
import { coldMailLines, inSendWindow, alreadySent } from '../lib/consult/report/mail.ts'
import { parseJsonObject } from '../lib/analysis/llm.ts'
import { validateModeB } from '../lib/consult/report/mode-b-validate.ts'
import { validateModeC1 } from '../lib/consult/report/mode-c1-validate.ts'
import { validateModeC2 } from '../lib/consult/report/mode-c2-validate.ts'
import { buildSystem } from '../lib/consult/report/ch1.ts'
import { pickSimilar } from '../lib/consult/cases-validate.ts'
import { poolKeywords } from '../lib/consult/report/mode-c2.ts'
let pass = 0, fail = 0
const t = (name, ok) => { if (ok) pass++; else { fail++; console.log(`❌ ${name}`) } }

// R1/R2 — URL 검증(SSRF)
t('https 주소 통과', normalizeCompanyUrl('https://solutionarch.vercel.app')?.hostname === 'solutionarch.vercel.app')
t('스킴 생략 시 https 보충', normalizeCompanyUrl('shiftee.io')?.protocol === 'https:')
for (const bad of ['http://localhost', 'https://127.0.0.1', 'https://10.0.0.5/x', 'https://[::1]', 'ftp://a.com', 'https://u:p@a.com', 'https://a.com:8080', 'https://intranet', 'https://a.local', '', 'javascript:alert(1)'])
  t(`거절: ${bad}`, normalizeCompanyUrl(bad) === null)

// R2 — robots 판정
t('robots: 전체 허용', robotsDecision('User-agent: *\nDisallow:', '/') === 'allowed')
t('robots: * 전체 차단', robotsDecision('User-agent: *\nDisallow: /', '/about') === 'disallowed')
t('robots: 경로 차단', robotsDecision('User-agent: *\nDisallow: /private', '/private/x') === 'disallowed')
t('robots: 다른 경로는 허용', robotsDecision('User-agent: *\nDisallow: /private', '/about') === 'allowed')
t('robots: 다른 봇 규칙은 무시', robotsDecision('User-agent: Googlebot\nDisallow: /', '/') === 'allowed')
t('robots: 우리 봇 이름 차단', robotsDecision('User-agent: SolutionArchiveBot\nDisallow: /', '/') === 'disallowed')

// R2 — HTML 텍스트 추출
const h = htmlToText('<html><head><title>시프티 &amp; 근태</title><style>x{}</style></head><body><script>var a=1</script><h1>근태 관리</h1><p>출퇴근 &nbsp;기록</p></body></html>')
t('title 추출·엔티티', h.title === '시프티 & 근태')
t('script/style 제거', !h.text.includes('var a') && !h.text.includes('x{}'))
t('본문 유지', h.text.includes('근태 관리') && h.text.includes('출퇴근'))

// R3 — 1장 검증기(모델 출력 형식)
const okRaw = { headline: '요금 안내가 가입 직전에 끊깁니다', leak_or_gap: { kind: 'leak', title: '가격 불투명', detail: '한 줄 설명은 요금제를 말하는데 메뉴와 가입 화면에는 요금 안내가 없어 가입 직전에 끊깁니다.' }, position: { category: '근태 관리', where: '중소 사업장 하단', basis: '소개 페이지 기준' }, loss: { low_man: 30, high_man: 120, formula: '월 방문 x 전환 손실', assumptions: ['[사용자 입력] 월 방문 3,000', '[업계 일반값] 전환 1% (공개 벤치마크)'], note: '추정' } }
t('ch1 정상 통과', validateCh1(okRaw, { thin: false }).loss.high_man === 120)
for (const [name, mut] of [
  ['손실 범위 역전', (r) => ({ ...r, loss: { ...r.loss, low_man: 200 } })],
  ['손실 범위 0~0', (r) => ({ ...r, loss: { ...r.loss, low_man: 0, high_man: 0 } })],
  ['가정 없음', (r) => ({ ...r, loss: { ...r.loss, assumptions: [] } })],
  ['kind 없음(누수로 접지 않는다)', (r) => ({ ...r, leak_or_gap: { ...r.leak_or_gap, kind: undefined } })],
  ['detail 너무 짧음', (r) => ({ ...r, leak_or_gap: { ...r.leak_or_gap, detail: '짧다' } })],
  ['headline 없음', (r) => ({ ...r, headline: '' })],
  ['금지 표현(90일 재측정)', (r) => ({ ...r, headline: '90일 재측정 하세요' })],
]) { let threw = false; try { validateCh1(mut(okRaw), { thin: true }) } catch { threw = true } t('ch1 거절: ' + name, threw) }
{ let ok=true; try { validateCh1({ ...okRaw, headline: '액션플랜을 정리하세요' }, { thin: false }) } catch { ok=false } t('ch1: 액션플랜 표현은 허용', ok) }

// v71cl-엔진 — ch1.viability(Fit·실패모드·세그먼트)
const viaOk = { fit_broken_stage: 2, fit_color: '🔴', fit_test_result: '제품 가격·마찰이 채널 경제성과 맞지 않음', failure_modes: ['F8', 'F6'], segment: 'S' }
t('ch1: viability 정상 통과', validateCh1({ ...okRaw, viability: viaOk }, { thin: false }).viability?.fit_broken_stage === 2)
t('ch1: viability 없으면 undefined(옛 캐시 호환)', validateCh1(okRaw, { thin: false }).viability === undefined)
for (const [name, bad] of [
  ['stage 5(범위 밖)', { ...viaOk, fit_broken_stage: 5 }],
  ['fit_color 틀림', { ...viaOk, fit_color: 'red' }],
  ['failure_modes 4개(최대 3)', { ...viaOk, failure_modes: ['F1', 'F2', 'F3', 'F4'] }],
  ['failure_modes 에 F14(없는 코드)', { ...viaOk, failure_modes: ['F14'] }],
  ['segment 틀림', { ...viaOk, segment: 'X' }],
]) { let th = false; try { validateCh1({ ...okRaw, viability: bad }, { thin: false }) } catch { th = true } t('ch1 viability 거절: ' + name, th) }

// H5(2026-11-14 남헌 채점 피드백) — 판정 보류(⬜)
const viaPending = { fit_broken_stage: 0, fit_color: '⬜', fit_test_result: '판정 보류', failure_modes: [], segment: 'S', missing_info: ['월 사용자 수', '유료 전환 여부'] }
t('ch1: viability 판정 보류(⬜) 1~2개 통과', validateCh1({ ...okRaw, viability: viaPending }, { thin: false }).viability?.missing_info?.length === 2)
t('ch1: viability 🟡/🔴/🟢 는 missing_info 없어도 통과(회귀 없음)', validateCh1({ ...okRaw, viability: viaOk }, { thin: false }).viability?.missing_info === undefined)
for (const [name, bad] of [
  ['⬜ 인데 missing_info 없음', { ...viaPending, missing_info: undefined }],
  ['⬜ 인데 missing_info 0개', { ...viaPending, missing_info: [] }],
  ['⬜ 인데 missing_info 3개(최대 2)', { ...viaPending, missing_info: ['a', 'b', 'c'] }],
]) { let th = false; try { validateCh1({ ...okRaw, viability: bad }, { thin: false }) } catch { th = true } t('ch1 viability 거절: ' + name, th) }
t('단가: mock 은 0', costUsd('mock', 1e6, 1e6) === 0)
t('단가: opus 1M in/out = 90', costUsd('opus', 1e6, 1e6) === 90)

// R4 — 1층 검증기: 곱셈은 코드가 한다, 사용자 숫자는 항에 그대로 들어 있어야 한다
// 2026-11-13 지시 §2-3: 모델은 사용자 숫자 3개만 낸다. "놓치는 비율" 가정 구간은 코드의 sensitivityTable(10/20/30%)로 대체.
const nums = { audience: 1000, rate_pct: 2, value_man: 10 }
const l1Raw = (over = {}) => ({
  recalc: { terms: [{ label: '월 대상자', low: 1000, high: 1000, user: true }, { label: '전환율(비율)', low: 0.02, high: 0.02, user: true }, { label: '객단가', low: 10, high: 10, user: true }], note: '' },
  candidates: [1, 2].map((n) => ({ title: 't' + n, what: 'w', why: 'y', rebuttal: 'r' })),
  benchmark: { position: 'p', basis: 'b' }, memo_first: '먼저 입구를 만드세요.', ...over })
const l1 = validateL1(l1Raw(), nums)
t('1층: 손실 범위는 민감도 10~30%(1000x2%x10x0.1=20, x0.3=60)', l1.recalc.low_man === 20 && l1.recalc.high_man === 60)
t('1층: sensitivity 3단(10/20/30%) 포함', l1.sensitivity.length === 3 && l1.sensitivity.map((r) => r.pct).join(',') === '10,20,30' && l1.sensitivity[1].loss_man === 40)
const rej = (name, raw) => { let th = false; try { validateL1(raw, nums) } catch { th = true } t('1층 거절: ' + name, th) }
rej('사용자 숫자 변조', l1Raw({ recalc: { terms: [{ label: 'a', low: 999, high: 999, user: true }, { label: 'b', low: 0.02, high: 0.02, user: true }, { label: 'c', low: 10, high: 10, user: true }], note: '' } }))
rej('후보 1개', l1Raw({ candidates: [{ title: 't', what: 'w', why: 'y', rebuttal: 'r' }] }))
rej('반박 없음', l1Raw({ candidates: [{ title: 't', what: 'w', why: 'y', rebuttal: '' }, { title: 't', what: 'w', why: 'y', rebuttal: 'r' }] }))
rej('항 1개', l1Raw({ recalc: { terms: [{ label: 'a', low: 1, high: 1, user: true }], note: '' } }))
rej('항 4개(자가 발명 가정 항 금지)', l1Raw({ recalc: { terms: [{ label: 'a', low: 1000, high: 1000, user: true }, { label: 'b', low: 0.02, high: 0.02, user: true }, { label: 'c', low: 10, high: 10, user: true }, { label: '놓치는 비율', low: 0.1, high: 0.3, user: false }], note: '' } }))
rej('항에 user:false 섞임', l1Raw({ recalc: { terms: [{ label: 'a', low: 1000, high: 1000, user: true }, { label: 'b', low: 0.02, high: 0.02, user: false }, { label: 'c', low: 10, high: 10, user: true }], note: '' } }))
for (const bad of [{ audience: 0 }, { audience: 'x' }, { audience: 10, rate_pct: 101 }, { audience: 10, rate_pct: 1, value_man: -1 }]) { let th = false; try { parseUserNumbers({ rate_pct: 1, value_man: 1, ...bad }) } catch { th = true } t('숫자 입력 거절: ' + JSON.stringify(bad), th) }
t('숫자 입력: 쉼표 허용', parseUserNumbers({ audience: '1,500', rate_pct: '2.5', value_man: '10' }).audience === 1500)

// R5 — 검색 질의는 허용 목록 안에서만
t('질의: 없는 카테고리는 버림', sanitizeCaseQuery({ category: 'Crypto', mechanisms: [] }).category === null)
t('질의: 메커니즘 허용 목록·최대 2개', sanitizeCaseQuery({ category: 'SaaS', mechanisms: ['subscription', 'x', 'pricing', 'seo-content'] }).mechanisms.length === 2)
t('사례 한 줄: 결정 내용 없으면 버림', caseLine({ company: 'A', key_decision: '', outcome: null, grade: 'B' }) === null)
t('사례 한 줄: 130자 이하', (caseLine({ company: 'A', key_decision: 'x'.repeat(500), outcome: 'failed', grade: 'B' })?.what.length ?? 999) <= 130)

// R6 — 결정 메모 검증기
const memoRaw = (o = {}) => ({ decision: '먼저 입구를 만드세요.', options: [{ name: 'A', pros: 'p', cons: 'c' }, { name: 'B', pros: 'p', cons: 'c' }], recommendation: { choice: 'A', reasons: ['r1', 'r2'], change_mind_if: ['x'] }, risks: [{ risk: 'r', mitigation: 'm' }], actionplan: [{ step: '입구 만들기', done_when: '가입 폼이 열린다' }, { step: '안내 보내기', done_when: '첫 10명에게 발송' }, { step: '반응 보기', done_when: '답장 3건' }], ...o })
t('메모: 정상 통과', validateCh2(memoRaw(), '먼저 입구를 만드세요.').actionplan.length === 3)
const rej2 = (name, raw, first = '먼저 입구를 만드세요.') => { let th = false; try { validateCh2(raw, first) } catch { th = true } t('메모 거절: ' + name, th) }
rej2('액션플랜에 날짜(2026-11-30)', memoRaw({ actionplan: [{ step: '2026-11-30 까지 만들기', done_when: 'x' }, { step: 'a', done_when: 'b' }, { step: 'c', done_when: 'd' }] }))
rej2('액션플랜에 날짜(11월 30일)', memoRaw({ actionplan: [{ step: 'a', done_when: '11월 30일에 끝' }, { step: 'a', done_when: 'b' }, { step: 'c', done_when: 'd' }] }))
rej2('액션플랜에 다음 주', memoRaw({ actionplan: [{ step: '다음 주에 하기', done_when: 'x' }, { step: 'a', done_when: 'b' }, { step: 'c', done_when: 'd' }] }))
rej2('액션플랜 2단계뿐', memoRaw({ actionplan: [{ step: 'a', done_when: 'b' }, { step: 'c', done_when: 'd' }] }))
rej2('1층 첫 문장과 다른 결론', memoRaw(), '가격을 먼저 올리세요 지금 바로')
rej2('90일 재측정', memoRaw({ risks: [{ risk: '90일 재측정 필요', mitigation: 'm' }] }))

// v71cl-엔진 — ch2 신규 필드(핵심 예측 확률·종료조건·기각 대안)
const memoV5 = validateCh2(memoRaw({ prediction_pct: 65, kill_condition: '4주 뒤 전환율이 지금의 절반 미만이면 접는다', rejected_alternative: { name: 'B', reason: '영업 조직이 필요해 지금 자원으로 불가' } }), '먼저 입구를 만드세요.')
t('메모: prediction_pct 통과', memoV5.prediction_pct === 65)
t('메모: kill_condition 통과', memoV5.kill_condition?.includes('4주'))
t('메모: rejected_alternative 통과', memoV5.rejected_alternative?.name === 'B')
t('메모: v5 필드 없으면 undefined(옛 캐시 호환)', validateCh2(memoRaw(), '먼저 입구를 만드세요.').prediction_pct === undefined)
rej2('prediction_pct 101(범위 밖)', memoRaw({ prediction_pct: 101 }))

// H6(2026-11-14 남헌 채점 피드백) — 아이디어형 "사업기획서 초안" 7섹션
const ideaRaw = (o = {}) => ({
  ...memoRaw({ actionplan: [{ step: '오늘 랜딩 만들기', done_when: '가입 폼이 열린다' }, { step: 'a', done_when: 'b' }, { step: 'c', done_when: 'd' }, { step: 'e', done_when: 'f' }, { step: 'g', done_when: 'h' }] }),
  understood: { customer: '소상공인', problem: '근태 기록이 수기다', solution: '앱으로 자동 기록', revenue_model: '월 구독' },
  customer_problem: '소상공인은 종이로 근태를 기록해 급여 정산에 시간이 오래 걸립니다.',
  business_model: '월 구독제, 사업장당 2만원.',
  market_gap: { detail: '기존 서비스는 대기업 전용이라 소상공인용이 비어 있습니다.', competitors: [{ name: 'A사', url: 'https://a.example', confirmed: true }, { name: 'B사', url: '확인 필요', confirmed: false }, { name: 'C사', url: '확인 필요', confirmed: false }] },
  first_customers: '지역 소상공인 커뮤니티에 직접 올리고 10명에게 무료 체험을 제공합니다.',
  ...o,
})
const idea = validateCh2(ideaRaw(), '먼저 입구를 만드세요.', 'idea')
t('ch2 idea: understood 통과', idea.understood?.customer === '소상공인')
t('ch2 idea: market_gap 경쟁사 3곳', idea.market_gap?.competitors.length === 3)
t('ch2 idea: actionplan 정확히 5단계', idea.actionplan.length === 5)
{ let th = false; try { validateCh2(ideaRaw({ actionplan: [{ step: 'a', done_when: 'b' }, { step: 'c', done_when: 'd' }, { step: 'e', done_when: 'f' }] }), '먼저 입구를 만드세요.', 'idea') } catch { th = true } t('ch2 idea 거절: actionplan 3단계(아이디어형은 5단계 고정)', th) }
{ let th = false; try { validateCh2(ideaRaw({ market_gap: { detail: 'x', competitors: [{ name: 'A', url: 'x', confirmed: true }] } }), '먼저 입구를 만드세요.', 'idea') } catch { th = true } t('ch2 idea 거절: 경쟁사 1곳(정확히 3곳)', th) }
t('ch2 company(기존): actionplan 3~6단계 그대로(회귀 없음)', validateCh2(memoRaw(), '먼저 입구를 만드세요.', 'company').understood === undefined)
rej2('prediction_pct 음수', memoRaw({ prediction_pct: -1 }))

// v71cm — execution_package(해결책 층: 산출물·2주 실험·플랜B)
const epOk = { artifacts: ['랜딩 첫 3줄 문안', '인터뷰 질문 5개'], experiment: { what: '선결제 반응 측정', who: '사장님 15명', n: 15, success_metric: '선결제 3건', if_fail: '후보 2로 전환' }, plan_b: { name: '후보 2', trigger: '선결제 0건' } }
const memoEp = validateCh2(memoRaw({ execution_package: epOk }), '먼저 입구를 만드세요.')
t('메모: execution_package 통과', memoEp.execution_package?.experiment.n === 15)
t('메모: execution_package 없으면 undefined(옛 캐시 호환)', validateCh2(memoRaw(), '먼저 입구를 만드세요.').execution_package === undefined)
rej2('execution_package.artifacts 1개(최소 2)', memoRaw({ execution_package: { ...epOk, artifacts: ['x'] } }))
rej2('execution_package.experiment.n 0 이하', memoRaw({ execution_package: { ...epOk, experiment: { ...epOk.experiment, n: 0 } } }))

// R7 — 에이전트 순수부
t('에이전트: final 파싱', parseStep({ final: '답' }).kind === 'final')
t('에이전트: tool 파싱', parseStep({ tool: 'show_memo', args: {} }).kind === 'tool')
for (const bad of [{}, { tool: 'drop_table' }, { final: '' }]) { let th = false; try { parseStep(bad) } catch { th = true } t('에이전트 거절: ' + JSON.stringify(bad), th) }
{ let th = false; try { validateToolArgs('search_cases', { category: 'Crypto' }) } catch { th = true } t('도구 인자: 허용 목록 밖 카테고리 거절', th) }
{ let th = false; try { validateToolArgs('recalc_loss', { audience: 100, rate_pct: 2, value_man: 10, leak_low: 0.5, leak_high: 0.1 }) } catch { th = true } t('도구 인자: leak_high < leak_low 거절', th) }
t('도구 인자: get_viability_rules segment 통과', validateToolArgs('get_viability_rules', { segment: 'S' }).segment === 'S')
{ let th = false; try { validateToolArgs('get_viability_rules', { segment: 'X' }) } catch { th = true } t('도구 인자: get_viability_rules 잘못된 segment 거절', th) }
t('손실 재계산: 1000x2%x10x(0.1~0.3)=20~60', recalcLoss({ audience: 1000, rate_pct: 2, value_man: 10, leak_low: 0.1, leak_high: 0.3 }).high_man === 60)

// R8 — 측정카드
t('모드: 운영 중+숫자 있음=roi', pickMode({ kind: 'company' }, true) === 'roi')
t('모드: 창업 전=몰랐던 사실', pickMode({ kind: 'idea' }, true) === 'unknown_fact')
t('모드: 숫자 없음=몰랐던 사실', pickMode({ kind: 'company' }, false) === 'unknown_fact')
t('ROI 카드: 목표>현재', buildRoiCard(2, '3.5', '2026-12-31').target === 3.5)
for (const [bt, bd] of [[2, '1'], [2, '101'], [2, 'x']]) { let th = false; try { buildRoiCard(bt, bd, '') } catch { th = true } t('ROI 카드 거절: 목표 ' + bd, th) }
{ let th = false; try { buildRoiCard(2, '3', '12/31') } catch { th = true } t('ROI 카드 거절: 점검일 형식', th) }
t('몰랐던 사실: 출처 있는 1개 통과', validateUnknownFacts({ facts: [{ fact: '가격 페이지가 없다', source: 'https://a.com' }] }).length === 1)
{ let th = false; try { validateUnknownFacts({ facts: [{ fact: '출처 없음', source: '' }] }) } catch { th = true } t('몰랐던 사실 거절: 출처 없음', th) }
{ let th = false; try { validateUnknownFacts({ facts: [{ fact: 'x'.repeat(131), source: 's' }] }) } catch { th = true } t('몰랐던 사실 거절: 130자 초과', th) }

// R9 — 구독 기간·권한
t('기간: 1/31 + 1달 = 2/28(비윤년)', addMonth(new Date('2027-01-31T00:00:00Z')).toISOString().slice(0, 10) === '2027-02-28')
t('기간: 12/15 + 1달 = 1/15', addMonth(new Date('2026-12-15T00:00:00Z')).toISOString().slice(0, 10) === '2027-01-15')
t('입금자명: 공백 정리', cleanDepositor('  홍  길동 ') === '홍 길동')
{ let th = false; try { cleanDepositor('a') } catch { th = true } t('입금자명 거절: 1자', th) }
t('권한: 활성+미래 = 유료', isActive([{ status: 'active', ends_at: '2999-01-01T00:00:00Z' }]))
t('권한: 활성이어도 만료 = 무료', !isActive([{ status: 'active', ends_at: '2000-01-01T00:00:00Z' }]))
t('권한: requested 는 유료 아님', !isActive([{ status: 'requested', ends_at: null }]))
t('권한: 빈 목록은 무료', !isActive([]))

// R11 — 3~6장 검증기·콜드메일 3줄·발송 시간
const c36 = (o = {}) => ({ candidates: [1, 2].map((n) => ({ title: 't' + n, what: 'w', why: 'y', rebuttal: 'r' })), customers: [1, 2].map((n) => ({ who: 'w' + n, need: 'n', reach: 'r' })), competitors: [1, 2].map((n) => ({ name: 'c' + n, kind: 'k', basis: 'b' })), obstacles: [1, 2].map((n) => ({ obstacle: 'o' + n, evidence: 'e', handle: 'h' })), ...o })
t('3~6장: 정상 통과', validateCh3to6(c36()).competitors.length === 2)
const rej36 = (name, raw) => { let th = false; try { validateCh3to6(raw) } catch { th = true } t('3~6장 거절: ' + name, th) }
rej36('경쟁 근거 없음', c36({ competitors: [{ name: 'a', kind: 'k', basis: '' }, { name: 'b', kind: 'k', basis: 'b' }] }))
rej36('후보 1개', c36({ candidates: [{ title: 't', what: 'w', why: 'y', rebuttal: 'r' }] }))
rej36('반박 없음', c36({ candidates: [{ title: 't', what: 'w', why: 'y', rebuttal: '' }, { title: 't', what: 'w', why: 'y', rebuttal: 'r' }] }))
rej36('90일 재측정', c36({ obstacles: [{ obstacle: '90일 재측정', evidence: 'e', handle: 'h' }, { obstacle: 'o', evidence: 'e', handle: 'h' }] }))
const mail = coldMailLines({ company: '시프티', headline: '요금 안내가 가입 직전에 끊깁니다.', reportUrl: 'https://x.test/r/abc' })
t('콜드메일: 정확히 3줄', mail.length === 3)
t('콜드메일: 비슷한 회사 k곳 문장 없음(Q-B 아니오)', !mail.join(' ').includes('같은 선택을 했을 때'))
t('콜드메일: 결론서 주소·탈리 링크 포함', mail[1].includes('https://x.test/r/abc') && mail[2].includes('tally.so/r/X55kqL'))
t('콜드메일: 헤드라인 끝 마침표 중복 없음', !mail[0].includes('..'))
t('콜드메일: 90일 재측정 없음', !mail.join(' ').includes('90일'))
t('발송 시간: KST 10시(UTC 01시) 가능', inSendWindow(new Date('2026-11-12T01:00:00Z')))
t('발송 시간: KST 18시(UTC 09시) 불가', !inSendWindow(new Date('2026-11-12T09:00:00Z')))
t('발송 시간: KST 08시(UTC 23시) 불가', !inSendWindow(new Date('2026-11-11T23:00:00Z')))
t('발송 시간: KST 09시(UTC 00시) 가능', inSendWindow(new Date('2026-11-12T00:00:00Z')))

// 7(d) 중복 발송 대조
const LOG = ['| 발송(KST) | 수신 | 회사 | D+3 |', '|---|---|---|---|', '| 11/06 08:00 | support@shiftee.io | 시프티 | 11/09 |', '| 11/06 08:00 | wooriyo@wooriyo.com | 핀플·알파요 | 11/09 |'].join('\n')
t('중복 발송: 시프티는 이미 발송', alreadySent(LOG, '시프티').sent)
t('중복 발송: 표기 차이(핀플 알파요)도 잡는다', alreadySent(LOG, '핀플 알파요').sent)
t('중복 발송: 처음 보내는 회사는 통과', !alreadySent(LOG, '크리에이지').sent)
t('중복 발송: 이름이 비면 판단하지 않는다(전부 일치 방지)', !alreadySent(LOG, '').sent)
t('중복 발송: 머리글·구분선 행은 회사로 세지 않는다', !alreadySent(LOG, '회사').sent)

// lib/analysis/llm.ts parseJsonObject — 공용 유틸(소구점 파이프라인 전체가 씀). smart-alba.com 라이브 테스트에서
// 모델이 문자열 값 안에 실제 줄바꿈을 넣어 JSON.parse 가 거절하는 경우를 재현해 추가한 복구 경로.
t('parseJsonObject: 정상 JSON은 그대로', parseJsonObject('{"a":1}').a === 1)
t('parseJsonObject: 코드블록 제거', parseJsonObject('```json\n{"a":1}\n```').a === 1)
t('parseJsonObject: 앞뒤 잡텍스트 제거', parseJsonObject('여기 있습니다: {"a":1} 끝').a === 1)
t('parseJsonObject: 문자열 안 원시 줄바꿈 복구', parseJsonObject('{"a":"줄1\n줄2"}').a === '줄1\n줄2')
t('parseJsonObject: 문자열 안 원시 탭 복구', parseJsonObject('{"a":"칸1\t칸2"}').a === '칸1\t칸2')
t('parseJsonObject: 구조(바깥) 줄바꿈은 그대로 구조로 처리', parseJsonObject('{\n"a":1,\n"b":2\n}').b === 2)
{ let th = false; try { parseJsonObject('이건 JSON이 아닙니다') } catch { th = true } t('parseJsonObject: JSON 없으면 거절', th) }

// v71cm 모드 B — 결정 검증(cap 규칙: 앞 다리가 비어 있으면 순서_바꿈만 가능)
const modeBOk = (o = {}) => ({
  two_line: { known: '29,000원은 중가대입니다.', unknown: '다리 1이 비어 있습니다.' },
  verdict: '순서_바꿈', verdict_reason: '다리 1이 비어 있어 가격을 먼저 붙이면 안 됩니다.',
  target_stage: 3, blocked_earlier_stage: 1,
  reference_group: { count: 9747, note: '해결 동작 9,747건 중 가격 레버 결과율 8.6~11.0%' },
  premortem: ['구체적이지 않았다', '이미 아는 내용이었다'],
  falsifiable_condition: '무가격 결론서 20통 중 답장 3건 이상이면 틀림', prediction_pct: 40, kill_condition: '60통까지 답장 0이면 채널 자체를 접는다',
  execution_package: { artifacts: ['메일 첫 줄', '측정 시트'], experiment: { what: '무가격 결론서 발송', who: '5분야 20곳', n: 20, success_metric: '답장 3건', if_fail: '폼 링크로 전환' }, plan_b: { name: '폼 링크', trigger: '답장 0건' } },
  ...o,
})
t('모드B: 정상 통과(순서_바꿈)', validateModeB(modeBOk()).verdict === '순서_바꿈')
t('모드B: cap 규칙 위반(앞 다리 비었는데 진행) 거절', (() => { let th = false; try { validateModeB(modeBOk({ verdict: '진행' })) } catch { th = true } return th })())
t('모드B: blocked_earlier_stage 가 target_stage 보다 뒤면 거절', (() => { let th = false; try { validateModeB(modeBOk({ blocked_earlier_stage: 4 })) } catch { th = true } return th })())
t('모드B: 잘못된 verdict 거절', (() => { let th = false; try { validateModeB(modeBOk({ verdict: '보류' })) } catch { th = true } return th })())
t('모드B: 앞 다리 안 비었으면 진행 가능', validateModeB(modeBOk({ blocked_earlier_stage: null, verdict: '진행' })).verdict === '진행')

// v71cm 모드 C1 — 아이디어 검증(게이트 6개 전부, blocked_stage 가 순서대로가 아닐 수 있음)
const gate6 = (over = {}) => ['G0.1', 'G0.2', 'G0.3', 'G0.4', 'G0.5', 'G0.6'].map((id) => ({ id, color: '🟡', reason: 'r', ...over[id] }))
const modeC1Ok = (o = {}) => ({
  two_line: { known: '노쇼가 손실입니다.', unknown: '네이버 예약이 이미 공짜로 줍니다.' },
  gates: gate6({ 'G0.2': { color: '🔴' }, 'G0.3': { color: '🔴' }, 'G0.5': { color: '🔴' } }),
  blocked_stage: 4, secondary_blocked_stage: 1,
  reference_group: { count: 10, note: 'YC B2B Retail 폐업률 34.9%' },
  experiment: { what: '네이버 예약 쓰는 미용실에 질문', who: '미용실 10곳', n: 10, success_metric: '4곳 이상 노쇼 남는다고 응답', if_fail: '접는다' },
  execution_package: { artifacts: ['인터뷰 질문 5개', '선결제 문구'], plan_b: { name: '플랫폼 밖 세그먼트', trigger: '4곳 미달' } },
  give_up_condition: '20% 미만이면 접는다',
  ...o,
})
t('모드C1: 정상 통과(게이트 6개, blocked_stage=4)', validateModeC1(modeC1Ok()).gates.length === 6 && validateModeC1(modeC1Ok()).blocked_stage === 4)
t('모드C1: 다리4가 먼저 끊기고 다리1이 secondary — 순서 역전 허용', validateModeC1(modeC1Ok()).secondary_blocked_stage === 1)
{ let th = false; try { validateModeC1(modeC1Ok({ gates: gate6().slice(0, 5) })) } catch { th = true } t('모드C1: 게이트 5개(6개 미만) 거절', th) }
{ let th = false; try { validateModeC1(modeC1Ok({ gates: [...gate6().slice(0, 5), { id: 'G0.1', color: '🟡', reason: 'r' }] })) } catch { th = true } t('모드C1: 게이트 ID 중복 거절', th) }
{ let th = false; try { validateModeC1(modeC1Ok({ experiment: { what: 'x', who: 'y', n: 0, success_metric: 'z', if_fail: 'w' } })) } catch { th = true } t('모드C1: experiment.n 0 이하 거절', th) }

// ── 2026-11-13 긴급·품질 지시 §2-2 — 1차·2차 손실 어긋남 자동 설명(코드만, LLM 아님) ──
t('손실 어긋남 설명: 2차가 1차보다 훨씬 높음 → "높게"', /높게/.test(explainLossDivergence({ low_man: 3, high_man: 30 }, { low_man: 72, high_man: 180 })))
t('손실 어긋남 설명: 2차가 1차보다 훨씬 낮음 → "낮게"', /낮게/.test(explainLossDivergence({ low_man: 100, high_man: 200 }, { low_man: 10, high_man: 20 })))
t('손실 어긋남 설명: 구간이 겹치면 방향 단정 없이 "겹치는 범위"', /겹치는 범위/.test(explainLossDivergence({ low_man: 10, high_man: 50 }, { low_man: 30, high_man: 80 })))

// ── [완료 묶음] G6 — 근거 충분도(코드 계산)·통계성 문장 린트 ──
t('근거충분도: 페이지 충분+thin아님+부재주장없음 → 높음', computeEvidenceLevel({ pageCount: 4, thin: false, hasAbsenceClaim: false }) === '높음')
t('근거충분도: thin 이면 한 단계 낮춤', computeEvidenceLevel({ pageCount: 4, thin: true, hasAbsenceClaim: false }) === '보통')
t('근거충분도: 부재주장 있으면 한 단계 더 낮춤', computeEvidenceLevel({ pageCount: 4, thin: true, hasAbsenceClaim: true }) === '낮음')
t('근거충분도: 페이지 0 + thin → 낮음에서 안 내려감(바닥)', computeEvidenceLevel({ pageCount: 0, thin: true, hasAbsenceClaim: true }) === '낮음')
t('ch1: evidence_level 이 항상 채워짐(옵셔널 아님)', ['낮음', '보통', '높음'].includes(validateCh1(okRaw, { thin: false, pageCount: 4 }).evidence_level))

// ── [우선순위 상향] H3 — 단계 분기(사용자 0명·미출시면 손실 생략, acquisition_plan 으로 대체) ──
t('computeStage: 사용자0명+미출시 → none', computeStage({ user_count_band: '0', revenue_band: '0', launched: false }) === 'none')
t('computeStage: 사용자0명이면 출시 여부와 무관하게 none(이미 출시했어도 0명이면 지어낼 근거가 없음)', computeStage({ user_count_band: '0', revenue_band: '0', launched: true }) === 'none')
t('computeStage: 매출 충분+출시 → full', computeStage({ user_count_band: '500+', revenue_band: '충분', launched: true }) === 'full')
t('computeStage: 옛 run(필드 전부 null) → full(기존 동작 호환)', computeStage({ user_count_band: null, revenue_band: null, launched: null }) === 'full')
const acqRaw = { ...okRaw, loss: undefined, acquisition_plan: { channels: [{ channel: '온라인 커뮤니티', message: '무료 체험 공유', effort: '낮음' }, { channel: '지인 소개', message: '직접 부탁', effort: '낮음' }, { channel: '관련 카페', message: '후기 요청', effort: '중간' }], market_message: '커뮤니티에 사용 후기를 공유합니다.', revenue_candidates: ['월 구독료'], has_basis: false } }
t('ch1: stage=none 이면 loss 없이 acquisition_plan 검증', validateCh1(acqRaw, { thin: true, stage: 'none' }).acquisition_plan?.channels.length === 3)
t('ch1: stage=none 인데 loss 가 있어도 acquisition_plan 쪽만 검사(loss 무시)', validateCh1(acqRaw, { thin: true, stage: 'none' }).loss === undefined)
{ let th = false; try { validateCh1({ ...okRaw, acquisition_plan: { channels: [{ channel: 'a', message: 'b', effort: 'c' }], market_message: 'm', revenue_candidates: ['r'], has_basis: false } }, { thin: true, stage: 'none' }) } catch { th = true } t('ch1 거절: stage=none 인데 channels 1개(3개 미만)', th) }
t('ch1: stage=low|full 은 기존처럼 loss 필수(회귀)', validateCh1(okRaw, { thin: false, stage: 'full' }).loss?.high_man === 120)

t('통계린트: "예측 확률 50%" 문장 적발', findStatViolations('예측 확률 50% 입니다').length > 0)
t('통계린트: "~% 더 늘어날 여지" 적발', findStatViolations('전환이 10% 더 늘어날 여지가 있습니다').length > 0)
t('통계린트: 사용자 입력 전환율 인용은 허용(위반 0건)', findStatViolations('전환율 3.2% 이상 유지되면 계속합니다').length === 0)
t('통계린트: 평범한 문장은 위반 0건', findStatViolations('먼저 입구를 만드세요.').length === 0)
{ let th = false; try { validateCh2(memoRaw({ recommendation: { choice: 'A', reasons: ['전환이 10% 더 늘어날 여지가 있습니다', 'r2'], change_mind_if: ['x'] } }), '먼저 입구를 만드세요.') } catch { th = true } t('메모 거절: 통계성 문장(근거없는 변화율)', th) }
{ let th = false; try { parseStep({ final: '예측 확률 70% 입니다' }) } catch { th = true } t('에이전트 거절: 확률 서술', th) }

// v71co P2-D — 모드 C2 검증기: 풀에 있는 사례만 허용, 후보 정확히 3개, 확률 서술 금지는 생성기(stat-lint)가 맡는다.
const c2Cand = (o = {}) => ({ name: '후보', why_now: 'w', who: 'x', price: '9,900원', how_to_sell: 'h', first_ten: 'f', reference_cases: [], failure_case: null, experiment: { what: 'a', who: 'b', n: 15, success_metric: 'm', if_fail: 'i' }, killed_bridges: ['다리 2·4 막혀 있지 않음'], ...o })
const c2Raw = (o = {}) => ({ two_line: { known: 'k', unknown: 'u' }, conditions_summary: 'c', excluded: [{ area: '셀러툴', reason: 'r' }], candidates: [c2Cand(), c2Cand(), c2Cand()], top_pick: { index: 0, reason: 'r', give_up_condition: 'g' }, execution_package: { artifacts: ['a1', 'a2'], plan_b: { name: 'p', trigger: 't' } }, ...o })
t('C2: 정상 입력 통과', validateModeC2(c2Raw(), []).candidates.length === 3)
{ let th = false; try { validateModeC2(c2Raw({ candidates: [c2Cand(), c2Cand()] }), []) } catch { th = true } t('C2 거절: 후보 3개 아님', th) }
{ let th = false; try { validateModeC2(c2Raw({ candidates: [c2Cand({ reference_cases: ['지어낸회사'] }), c2Cand(), c2Cand()] }), ['Gusto']) } catch { th = true } t('C2 거절: 풀에 없는 사례 인용(지어냄)', th) }
t('C2: 풀에 있는 사례는 대소문자 무관 통과', validateModeC2(c2Raw({ candidates: [c2Cand({ reference_cases: ['gusto'] }), c2Cand(), c2Cand()] }), ['Gusto']).candidates[0].reference_cases[0] === 'gusto')
{ let th = false; try { validateModeC2(c2Raw({ top_pick: { index: 3, reason: 'r', give_up_condition: 'g' } }), []) } catch { th = true } t('C2 거절: top_pick 범위 밖', th) }
{ let th = false; try { validateModeC2(c2Raw({ candidates: [c2Cand({ killed_bridges: [] }), c2Cand(), c2Cand()] }), []) } catch { th = true } t('C2 거절: 막히지 않음 확인 문장 없음', th) }
t('C2 풀 키워드: 영문 단어만 추가, 중복 제거', poolKeywords({ access: '소상공인 restaurant' }).filter((k) => k === 'restaurant').length === 1)
t('B: prediction_pct 를 줘도 출력에 남지 않는다(R10 전 확률 금지)', !('prediction_pct' in validateModeB({ two_line: { known: 'k', unknown: 'u' }, verdict: '순서_바꿈', verdict_reason: 'r', target_stage: 3, blocked_earlier_stage: 1, reference_group: { count: 0, note: 'n' }, premortem: ['a', 'b'], falsifiable_condition: 'f', prediction_pct: 40, kill_condition: 'k', execution_package: { artifacts: ['a', 'b'], experiment: { what: 'w', who: 'x', n: 5, success_metric: 'm', if_fail: 'i' }, plan_b: { name: 'p', trigger: 't' } } })))

// v71co P1-B — 가정값 근거 라벨. 라벨 없는 가정·[근거 없음]+숫자 범위는 거절, 범위 포기(loss_unavailable)는 허용, 프롬프트에 예시 숫자 없음.
{ let th = false; try { validateCh1({ ...okRaw, loss: { ...okRaw.loss, assumptions: ['월 방문 3,000'] } }, { thin: false }) } catch { th = true } t('가정 라벨 없음 거절(P1-B)', th) }
{ let th = false; try { validateCh1({ ...okRaw, loss: { ...okRaw.loss, assumptions: ['[근거 없음] 객단가'] } }, { thin: false }) } catch { th = true } t('[근거 없음] 가정 + 숫자 범위 거절(P1-B)', th) }
t('[사례 3건 기반] 라벨 통과', validateCh1({ ...okRaw, loss: { ...okRaw.loss, assumptions: ['[사례 3건 기반] 비슷한 회사 평균'] } }, { thin: false }).loss.assumptions.length === 1)
{ let th = false; try { validateCh1({ ...okRaw, loss: { ...okRaw.loss, assumptions: ['[사례 0건 기반] 없음'] } }, { thin: false }) } catch { th = true } t('[사례 0건 기반] 거절(N은 1 이상)', th) }
{ const r = validateCh1({ ...okRaw, loss: null, loss_unavailable: '직접 확인 필요: 월 방문자 수' }, { thin: false }); t('근거 없으면 범위 포기(loss_unavailable) 허용', r.loss === undefined && r.loss_unavailable.startsWith('직접 확인 필요')) }
{ let th = false; try { validateCh1({ ...okRaw, loss: null }, { thin: false }) } catch { th = true } t('loss 도 loss_unavailable 도 없으면 거절', th) }
for (const st of ['low', 'full']) { const sys = buildSystem(st); const nums = (sys.match(/d{2,}/g) ?? []).filter((n) => !['130', '60', '80', '500'].includes(n)); t('ch1 프롬프트 예시 숫자 없음(' + st + '): ' + nums.join(','), nums.length === 0) }

// v71co P1-C — 비슷한 사례 판정 결과 정리: 범위 밖 번호·중복·why 없음은 버리고, 아무것도 못 고르면 빈 배열(억지로 채우지 않음).
{ const c = [{ name: 'A', what: 'a' }, { name: 'B', what: 'b' }, { name: 'C', what: 'c' }, { name: 'D', what: 'd' }]
  t('pickSimilar: why 붙여 반환', pickSimilar({ picks: [{ i: 1, why: '같은 고객·과금' }] }, c, 3)[0].why === '같은 고객·과금')
  t('pickSimilar: 범위 밖·중복·why 없음 버림', pickSimilar({ picks: [{ i: 9, why: 'x' }, { i: 1, why: 'ok' }, { i: 1, why: 'dup' }, { i: 2 }, { i: 3, why: '  ' }] }, c, 3).length === 1)
  t('pickSimilar: 0개 선택은 빈 배열', pickSimilar({ picks: [] }, c, 3).length === 0 && pickSimilar({}, c, 3).length === 0)
  t('pickSimilar: limit 적용·why 60자 절단', pickSimilar({ picks: [0, 1, 2, 3].map((i) => ({ i, why: 'w'.repeat(100) })) }, c, 3).length === 3 && pickSimilar({ picks: [{ i: 0, why: 'w'.repeat(100) }] }, c, 3)[0].why.length === 60) }

// v71cp G8 — 예측 기록: 범주형만(prob 항상 null), 숫자 확률 필드는 읽지 않음, 기록 실패는 던지지 않음.
{ const { buildPredictions, recordPredictions, DUE_DAYS } = await import('../lib/consult/predictions.ts')
  const now = new Date('2026-11-16T00:00:00Z')
  const b = buildPredictions('r1', 'b', { verdict: '중단', verdict_reason: '앞 다리가 비었습니다', falsifiable_condition: 'f', kill_condition: 'k', prediction_pct: 40, reference_group: { count: 12 } }, now)
  t('G8 B: 3행·verdict 범주·근거수', b.length === 3 && b[0].verdict === '중단' && b.every((r) => r.evidence_count === 12))
  t('G8: prob 는 항상 null(R10 전)', b.every((r) => r.prob === null) && !JSON.stringify(b).includes('40'))
  t('G8: due_at = +90일', DUE_DAYS === 90 && b[0].due_at === '2027-02-14T00:00:00.000Z')
  const c1 = buildPredictions('r1', 'c1', { blocked_stage: 2, give_up_condition: 'g', reference_group: { count: 3 } }, now)
  t('G8 C1: 끊긴 다리 범주', c1[0].verdict === 'blocked_stage_2' && c1.length === 2)
  const c2 = buildPredictions('r1', 'c2', { candidates: [{ name: 'A', reference_cases: ['x', 'y'], failure_case: 'z' }], top_pick: { index: 0, reason: 'r', give_up_condition: 'g' } }, now)
  t('G8 C2: 1순위·근거수(참조+실패)', c2[0].claim.startsWith('1순위 A') && c2[0].evidence_count === 3)
  t('G8 결론서: viability 없으면 headline 1행', buildPredictions('r1', 'report', { headline: 'h', leak_or_gap: { kind: 'gap' }, similar: [1, 2] }, now).length === 1)
  t('G8: 빈 결과는 0행', buildPredictions('r1', 'b', {}, now).length === 0)
  t('G8: 메모는 prediction_pct 무시', !JSON.stringify(buildPredictions('r1', 'memo', { recommendation: { choice: 'A', change_mind_if: ['x'] }, prediction_pct: 77 }, now)).includes('77'))
  const errSb = { from: () => ({ insert: async () => ({ error: { message: 'relation "consult_predictions" does not exist' } }) }) }
  const throwSb = { from: () => { throw new Error('boom') } }
  const okSb = { rows: null, from() { return { insert: async (r) => { okSb.rows = r; return { error: null } } } } }
  const origErr = console.error; console.error = () => {}
  t('G8: 테이블 미적용 → failed(던지지 않음)', (await recordPredictions(errSb, 'r1', 'b', { verdict: '중단', verdict_reason: 'v' })) === 'failed')
  t('G8: 클라이언트 예외 → failed(던지지 않음)', (await recordPredictions(throwSb, 'r1', 'b', { verdict: '중단', verdict_reason: 'v' })) === 'failed')
  console.error = origErr
  t('G8: 정상 → recorded', (await recordPredictions(okSb, 'r1', 'c1', { blocked_stage: 1, give_up_condition: 'g' })) === 'recorded' && okSb.rows.length === 2)
  t('G8: 남길 것 없음 → empty', (await recordPredictions(okSb, 'r1', 'b', {})) === 'empty')
  const mig = (await import('node:fs')).readFileSync(new URL('../supabase/migrations/20261116000001_consult_predictions_categorical.sql', import.meta.url), 'utf8')
  t('G8 마이그: prob null CHECK·범주 칼럼', /check \(prob is null\)/.test(mig) && /add column if not exists verdict/.test(mig) && /add column if not exists evidence_count/.test(mig)) }

// v71cp P2-F — 참조군 자동 발견: 주입 조회만(웹 없음), 3규칙, 근거 부족 먼저, 조회 실패는 확인 불가.
{ const { discoverRefGroups, judgeCandidate, inferStructure, matchDomains, areasFrom, discoveryLines, hasWord } = await import('../lib/consult/discover.ts')
  const fs = await import('node:fs')
  const read = (f) => JSON.parse(fs.readFileSync(new URL(`../config/${f}`, import.meta.url), 'utf8'))
  const areas = areasFrom(read('areas_v2.json'), read('community_keywords_v2.json'))
  t('P2-F: areas_v2 로딩(분야 ≥5)', areas.length >= 5 && areas.some((a) => a.key === 'booking_scheduling_forms' && a.ko?.includes('노쇼')))
  t('P2-F: 노쇼 → 예약 분야', matchDomains('미용실 노쇼를 줄이는 예약 앱', areas)[0]?.key === 'booking_scheduling_forms')
  t('P2-F: 분야 단서 없으면 빈 배열', matchDomains('zzz qqq', areas).length === 0)
  t('P2-F: 구조 추론(소상공인·구독)', JSON.stringify(inferStructure('소상공인 대상 월 구독')) === JSON.stringify({ buyer_type: 'smb_owner', pricing_model: 'subscription' }))
  t('P2-F: 단서 없으면 구조 키 없음(추정 금지)', Object.keys(inferStructure('좋은 앱')).length === 0)
  const row = (i, outcome, buyer = 'smb_owner', pricing = 'subscription') => ({ case_id: `yc_companies:Co${i}`, buyer_type: buyer, pricing_model: pricing, outcome })
  const area = { key: 'booking_scheduling_forms', name_ko: '예약' }
  const S = { buyer_type: 'smb_owner', pricing_model: 'subscription' }
  const good = [...Array.from({ length: 9 }, (_, i) => row(i, 'success')), row(9, 'failure'), row(10, 'success', 'enterprise')]
  const g = judgeCandidate(area, good, S)
  t('P2-F: 3규칙 통과 → ok·n=10(CEM 으로 enterprise 제외)', g.status === 'ok' && g.n === 10 && g.failures === 1 && g.examples.some((e) => e.outcome === 'failure'))
  t('P2-F: 9건 → 근거 부족', judgeCandidate(area, good.slice(1), S).note.startsWith('근거 부족') && !judgeCandidate(area, good.slice(1), S).rules.n10)
  t('P2-F: 실패 사례 없음 → 근거 부족', judgeCandidate(area, [...good.slice(0, 9), row(11, 'success')], S).rules.hasFailure === false)
  t('P2-F: 구조 키 없음 → 근거 부족(구조 매칭 실패)', judgeCandidate(area, good, {}).status === 'insufficient' && !judgeCandidate(area, good, {}).rules.structureMatch)
  t('P2-F: outcome unknown 은 세지 않음', judgeCandidate(area, [...good, row(12, 'unknown')], S).n === 10)
  t('P2-F: 출력에 확률·성공률 숫자 없음', !('p' in g) && !/%/.test(g.note))
  const calls = []
  const fake = async (d) => { calls.push(d); if (d === 'sales_crm') throw new Error('down'); return d === 'booking_scheduling_forms' ? good : good.slice(1) }
  const origErr = console.error; console.error = () => {}
  const d = await discoverRefGroups('소상공인 미용실 노쇼 예약 월 구독 CRM 고객관리', areas, fake)
  console.error = origErr
  t('P2-F: 주입 조회만 호출(분야별 1회)', calls.length === d.candidates.length && calls.includes('booking_scheduling_forms'))
  t('P2-F: 조회 실패 → not_run(근거 부족으로 접지 않음)', d.candidates.find((c) => c.domain === 'sales_crm')?.status === 'not_run')
  t('P2-F: 근거 부족 후보가 먼저', d.candidates[0].status !== 'ok' && d.candidates.at(-1).status === 'ok' && d.status === 'ok')
  t('P2-F: 낱말 적중 — 대기가 대기업에 안 걸리고 조사 붙은 대기는 걸림', !hasWord('대기업 영업 도구', '대기') && hasWord('대기를 줄이고 싶다', '대기') && hasWord('예약 노쇼', '예약') && hasWord('payroll tool', 'payroll'))
  t('P2-F: 분야 없음 → no_domain·근거 부족 줄', (await discoverRefGroups('zzz', areas, fake)).status === 'no_domain' && discoveryLines({ status: 'no_domain', structure: {}, candidates: [] })[0].includes('근거 부족'))
  t('P2-F: 전부 조회 실패 → not_run', (await (async () => { console.error = () => {}; const r = await discoverRefGroups('노쇼 예약', areas, async () => { throw new Error('x') }); console.error = origErr; return r })()).status === 'not_run')
  const src = fs.readFileSync(new URL('../lib/consult/discover.ts', import.meta.url), 'utf8')
  t('P2-F: 라이브 웹 호출 없음(fetch(/http)', !/\bfetch\(|https?:\/\//.test(src.replace(/^\s*\/\/.*$/gm, ''))) }

// v71ct §4 회귀: 흐름 카드 꺼내 쓰기(깃발 OFF 면 기존 경로 그대로)·스토리 꼬리표 자동 검사
{
  const ok = async (f) => { try { await import(f); return true } catch (e) { console.error(String(e?.message ?? e).split(String.fromCharCode(10))[0]); return false } }
  t('v71ct: story-flow 회귀 10건(적격·모름 감점·폴백·signal 금지·실패 포함·다른 업종·깃발 OFF·not_run)', await ok('./story-flow-selftest.mjs'))
  t('v71ct: story-label 자동 검사(인용·숫자·근거·장 비중)', await ok('./story-label-selftest.mjs'))
  t('v71cu: story flow v2(점수식·회사당 1장·안 된 시도·폴백 순서·깃발 OFF=기존 경로·mat 폴백·인용 검증)', await ok('./story-flow-select-selftest.mjs'))
  t('v71cu: 쌍 찾기(비슷함 점수·글당 1개·상위 k·멱등·통과 칸 집계·마이그 보안 자세)', await ok('./pair-finder-selftest.mjs'))
}

console.log(fail ? `실패 ${fail}건 / 통과 ${pass}건` : `통과 ${pass}건`)
process.exitCode = fail ? 1 : 0
