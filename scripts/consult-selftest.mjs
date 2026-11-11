// 컨설팅 MVP 셀프테스트(v71ci) — 네트워크·DB 없이 도는 순수 함수만. 블록이 늘 때마다 이 파일에 케이스를 더한다.
import { normalizeCompanyUrl } from '../lib/consult/url.ts'
import { robotsDecision, htmlToText } from '../lib/consult/collect.ts'
import { validateCh1 } from '../lib/consult/report/ch1-validate.ts'
import { costUsd } from '../lib/consult/cost.ts'
import { validateL1, parseUserNumbers } from '../lib/consult/report/ch1-l1-validate.ts'
import { sanitizeCaseQuery, caseLine } from '../lib/consult/cases-validate.ts'
import { validateCh2 } from '../lib/consult/report/ch2-validate.ts'
import { parseStep, validateToolArgs, recalcLoss } from '../lib/consult/agent-validate.ts'
import { pickMode, buildRoiCard, validateUnknownFacts } from '../lib/consult/measure-validate.ts'
import { addMonth, cleanDepositor } from '../lib/consult/period.ts'
import { isActive } from '../lib/consult/entitlement.ts'
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
const okRaw = { headline: '요금 안내가 가입 직전에 끊깁니다', leak_or_gap: { kind: 'leak', title: '가격 불투명', detail: '요금제 페이지가 없습니다.' }, position: { category: '근태 관리', where: '중소 사업장 하단', basis: '소개 페이지 기준' }, loss: { low_man: 30, high_man: 120, formula: '월 방문 x 전환 손실', assumptions: ['월 방문 3,000', '전환 1%'], note: '추정' } }
t('ch1 정상 통과', validateCh1(okRaw, { thin: false }).loss.high_man === 120)
for (const [name, mut] of [
  ['손실 범위 역전', (r) => ({ ...r, loss: { ...r.loss, low_man: 200 } })],
  ['손실 범위 0~0', (r) => ({ ...r, loss: { ...r.loss, low_man: 0, high_man: 0 } })],
  ['가정 없음', (r) => ({ ...r, loss: { ...r.loss, assumptions: [] } })],
  ['headline 없음', (r) => ({ ...r, headline: '' })],
  ['금지 표현(90일 재측정)', (r) => ({ ...r, headline: '90일 재측정 하세요' })],
]) { let threw = false; try { validateCh1(mut(okRaw), { thin: true }) } catch { threw = true } t('ch1 거절: ' + name, threw) }
{ let ok=true; try { validateCh1({ ...okRaw, headline: '액션플랜을 정리하세요' }, { thin: false }) } catch { ok=false } t('ch1: 액션플랜 표현은 허용', ok) }
t('단가: mock 은 0', costUsd('mock', 1e6, 1e6) === 0)
t('단가: opus 1M in/out = 90', costUsd('opus', 1e6, 1e6) === 90)

// R4 — 1층 검증기: 곱셈은 코드가 한다, 사용자 숫자는 항에 그대로 들어 있어야 한다
const nums = { audience: 1000, rate_pct: 2, value_man: 10 }
const l1Raw = (over = {}) => ({
  recalc: { terms: [{ label: '월 대상자', low: 1000, high: 1000, user: true }, { label: '전환율(비율)', low: 0.02, high: 0.02, user: true }, { label: '객단가', low: 10, high: 10, user: true }, { label: '놓치는 비율', low: 0.1, high: 0.3, user: false }], note: '추정' },
  candidates: [1, 2].map((n) => ({ title: 't' + n, what: 'w', why: 'y', rebuttal: 'r' })),
  benchmark: { position: 'p', basis: 'b' }, memo_first: '먼저 입구를 만드세요.', ...over })
const l1 = validateL1(l1Raw(), nums)
t('1층: 코드가 곱한다(1000x0.02x10x0.1=20, x0.3=60)', l1.recalc.low_man === 20 && l1.recalc.high_man === 60)
const rej = (name, raw) => { let th = false; try { validateL1(raw, nums) } catch { th = true } t('1층 거절: ' + name, th) }
rej('사용자 숫자 변조', l1Raw({ recalc: { terms: [{ label: 'a', low: 999, high: 999, user: true }, { label: 'b', low: 0.02, high: 0.02, user: true }, { label: 'c', low: 10, high: 10, user: true }], note: '' } }))
rej('후보 1개', l1Raw({ candidates: [{ title: 't', what: 'w', why: 'y', rebuttal: 'r' }] }))
rej('반박 없음', l1Raw({ candidates: [{ title: 't', what: 'w', why: 'y', rebuttal: '' }, { title: 't', what: 'w', why: 'y', rebuttal: 'r' }] }))
rej('항 1개', l1Raw({ recalc: { terms: [{ label: 'a', low: 1, high: 1, user: true }], note: '' } }))
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

// R7 — 에이전트 순수부
t('에이전트: final 파싱', parseStep({ final: '답' }).kind === 'final')
t('에이전트: tool 파싱', parseStep({ tool: 'show_memo', args: {} }).kind === 'tool')
for (const bad of [{}, { tool: 'drop_table' }, { final: '' }]) { let th = false; try { parseStep(bad) } catch { th = true } t('에이전트 거절: ' + JSON.stringify(bad), th) }
{ let th = false; try { validateToolArgs('search_cases', { category: 'Crypto' }) } catch { th = true } t('도구 인자: 허용 목록 밖 카테고리 거절', th) }
{ let th = false; try { validateToolArgs('recalc_loss', { audience: 100, rate_pct: 2, value_man: 10, leak_low: 0.5, leak_high: 0.1 }) } catch { th = true } t('도구 인자: leak_high < leak_low 거절', th) }
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

console.log(fail ? `실패 ${fail}건 / 통과 ${pass}건` : `통과 ${pass}건`)
process.exitCode = fail ? 1 : 0
