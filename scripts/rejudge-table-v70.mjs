// v70 L-02 — robots 원문(reports/2026-10-14/robots-originals-v70.json) + v70 §2 코드로 재판정 결과표 마크다운을 만든다.
// 루트 경로만 보면 'Allow: /$ + Disallow: /'(SLR클럽)가 허용으로 읽힌다 → 내용 경로 샘플(/__content/sample) 판정을 함께 낸다.
import fs from 'node:fs'
import { parseRobots, robotsVerdict } from '../lib/review/robots.ts'
import { PRODUCT_TOKEN } from '../lib/review/runner.ts'
const r = JSON.parse(fs.readFileSync('reports/2026-10-14/robots-originals-v70.json', 'utf8'))
const code = {
 'KR1-01':'SAMPLE|unknown·AI봇 신호','KR1-02':'SAMPLE|unknown(공개분만)','KR1-03':'RETRY|렌더 필요','KR1-04':'SAMPLE|tos_risk(공개 글만)','KR1-05':'REDEFINE|개별 블로그 단위로 이관','KR1-06':'SAMPLE|tos_risk','KR1-07':'RETRY|403','KR1-08':'RETRY|(원문 대조: 전면 RD 후보)','KR1-09':'SAMPLE|RD 전면·저속','KR1-10':'SAMPLE|tos_risk 경계(앱 후기 구역)','KR1-11':'SAMPLE|tos_risk 경계','KR1-12':'RETRY|403','KR1-13':'SAMPLE|unknown·AI봇 신호','KR1-14':'SAMPLE|RD 전면·저속','KR1-15':'SAMPLE|공개 구역만(로그인 안쪽 BLOCKED)','KR1-16':'SAMPLE|unknown',
 'EN2-01':'SAMPLE|RD(리뷰 경로)·저속','EN2-02':'RETRY|렌더','EN2-03':'SAMPLE|clear 가능성·최우선 후보','EN2-04':'SAMPLE|unknown(실제 앱 URL)','EN2-05':'SAMPLE|tos_risk','EN2-06':'OUT|리뷰 없음(1회 재확인)','EN2-07':'SAMPLE|unknown(최근 글 비율)','EN2-08':'SAMPLE|tos_risk','EN2-09':'RETRY|403','EN2-10':'RETRY|526·403','EN2-11':'SAMPLE|RD(평점·프로필)·저속','EN2-12':'RETRY|403·tos_risk','EN2-13':'SAMPLE|tos_risk(새 정책 대표)','EN2-14':'SAMPLE|unknown(실제 URL)','EN2-15':'SAMPLE|tos_risk(공식 API 우선)','EN2-16':'SAMPLE|unknown',
 'EN3-01':'SAMPLE|인스턴스별','EN3-02':'RETRY|공식 AT 프로토콜 API','EN3-03':'SAMPLE|unknown·crawl-delay 60초','EN3-04':'SAMPLE|tos_risk 경계(일부 RD)','EN3-05':'SAMPLE|RD·저속(로그인 벽 시 BLOCKED)','EN3-06':'RETRY|403','EN3-07':'SAMPLE|tos_risk(공식 RSS 우선)','EN3-08':'SAMPLE|clear·robots_ai_signal','EN3-09':'RETRY|403','EN3-10':'RETRY|본문 잘림','EN3-11':'SAMPLE|unknown(Discourse JSON)','EN3-12':'SAMPLE|unknown(Discourse JSON)','EN3-13':'SAMPLE|unknown','EN3-14':'SAMPLE|tos_risk(공식 API)','EN3-15':'SAMPLE|tos_risk(채널 선별)','EN3-16':'SAMPLE|tos_risk(*.canny.io 보드)'}
const rows = r.map((x) => {
  const id = x.label.split(' ')[0]; const [c, n] = (code[id] || '?|').split('|')
  const g = x.body ? parseRobots(x.body) : null
  const vc = g ? robotsVerdict(g, '/__content/sample', PRODUCT_TOKEN) : null
  const st = x.state_root.state + (vc && vc.state !== x.state_root.state ? ` / 내용경로 ${vc.state}` : '')
  const why = String(x.state_root.reason).replace(/\|/g, '/').slice(0, 70)
  return `| ${x.label} | ${c} | ${n} | ${x.status ?? x.error} | ${st} | ${why} | ${x.crawl_delay_sec ?? ''} |`
})
fs.writeFileSync('reports/2026-10-14/rejudge-table-v70.md', ['| 후보 | v70 코드 | v70 라벨 예상/메모 | HTTP | 원문 robots(루트·우리 UA) | 근거 | crawl-delay(s) |', '|---|---|---|---|---|---|---|', ...rows].join('\n') + '\n')
const cnt = (f) => r.filter(f).length
console.log('allowed', cnt((x) => x.state_root.state === 'allowed'), 'disallowed', cnt((x) => x.state_root.state === 'disallowed'), 'unverified', cnt((x) => x.state_root.state === 'unverified'))
