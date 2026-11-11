// 컨설팅 MVP 셀프테스트(v71ci) — 네트워크·DB 없이 도는 순수 함수만. 블록이 늘 때마다 이 파일에 케이스를 더한다.
import { normalizeCompanyUrl } from '../lib/consult/url.ts'
import { robotsDecision, htmlToText } from '../lib/consult/collect.ts'
import { validateCh1 } from '../lib/consult/report/ch1-validate.ts'
import { costUsd } from '../lib/consult/cost.ts'
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
t('단가: mock 은 0', costUsd('mock', 1e6, 1e6) === 0)
t('단가: opus 1M in/out = 90', costUsd('opus', 1e6, 1e6) === 90)

console.log(fail ? `실패 ${fail}건 / 통과 ${pass}건` : `통과 ${pass}건`)
process.exitCode = fail ? 1 : 0
