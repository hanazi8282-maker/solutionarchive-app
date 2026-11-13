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
const okRaw = { headline: '요금 안내가 가입 직전에 끊깁니다', leak_or_gap: { kind: 'leak', title: '가격 불투명', detail: '한 줄 설명은 요금제를 말하는데 메뉴와 가입 화면에는 요금 안내가 없어 가입 직전에 끊깁니다.' }, position: { category: '근태 관리', where: '중소 사업장 하단', basis: '소개 페이지 기준' }, loss: { low_man: 30, high_man: 120, formula: '월 방문 x 전환 손실', assumptions: ['월 방문 3,000', '전환 1%'], note: '추정' } }
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

console.log(fail ? `실패 ${fail}건 / 통과 ${pass}건` : `통과 ${pass}건`)
process.exitCode = fail ? 1 : 0
