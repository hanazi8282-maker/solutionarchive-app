// 컨설팅 MVP 셀프테스트(v71ci) — 네트워크·DB 없이 도는 순수 함수만. 블록이 늘 때마다 이 파일에 케이스를 더한다.
import { normalizeCompanyUrl } from '../lib/consult/url.ts'
import { robotsDecision, htmlToText } from '../lib/consult/collect.ts'
import { validateCh1 } from '../lib/consult/report/ch1-validate.ts'
import { costUsd } from '../lib/consult/cost.ts'
import { validateL1, parseUserNumbers } from '../lib/consult/report/ch1-l1-validate.ts'
import { sanitizeCaseQuery, caseLine } from '../lib/consult/cases-validate.ts'
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

console.log(fail ? `실패 ${fail}건 / 통과 ${pass}건` : `통과 ${pass}건`)
process.exitCode = fail ? 1 : 0
