#!/usr/bin/env node
// v70 L-11(a)/L-02 — 후보 호스트의 robots.txt 원문을 우리 UA 로 1회씩 읽어 reports 에 기록한다. 요약본이 아니라 원문 + 우리 UA 기준 3상태 판정.
// 호스트당 요청 1회(/robots.txt), 호스트 사이 4초. 403/캡차/HTML 은 우회하지 않고 그대로 기록한다.
import fs from 'node:fs'
import { USER_AGENT, PRODUCT_TOKEN } from '../lib/review/runner.ts'
import { looksLikeMarkup, parseRobots, robotsVerdict, robotsCrawlDelaySec } from '../lib/review/robots.ts'

const HOSTS = {
  'KR1-01 디시인사이드': 'gall.dcinside.com', 'KR1-02 블라인드': 'www.teamblind.com', 'KR1-03 커리어리': 'careerly.co.kr', 'KR1-04 퍼블리': 'publy.co',
  'KR1-05 티스토리': 'www.tistory.com', 'KR1-06 크몽': 'kmong.com', 'KR1-07 잡플래닛': 'www.jobplanet.co.kr', 'KR1-08 MLBPARK': 'mlbpark.donga.com',
  'KR1-09 네이트판': 'pann.nate.com', 'KR1-10 카페24': 'apps.cafe24.com', 'KR1-11 메일리': 'maily.so', 'KR1-12 원티드': 'www.wanted.co.kr',
  'KR1-13 인스티즈': 'www.instiz.net', 'KR1-14 SLR클럽': 'www.slrclub.com', 'KR1-15 사람인': 'www.saramin.co.kr', 'KR1-16 AI타임스': 'www.aitimes.com',
  'EN2-01 Chrome Web Store': 'chromewebstore.google.com', 'EN2-02 Edge Add-ons': 'microsoftedge.microsoft.com', 'EN2-03 Firefox AMO': 'addons.mozilla.org',
  'EN2-04 Atlassian': 'marketplace.atlassian.com', 'EN2-05 HubSpot Marketplace': 'ecosystem.hubspot.com', 'EN2-06 Zapier': 'zapier.com',
  'EN2-07 SourceForge': 'sourceforge.net', 'EN2-08 AlternativeTo': 'alternativeto.net', 'EN2-09 SaaSworthy': 'www.saasworthy.com', 'EN2-10 Slant': 'www.slant.co',
  'EN2-11 SoftwareSuggest': 'www.softwaresuggest.com', 'EN2-12 Crozdesk': 'crozdesk.com', 'EN2-13 FinancesOnline': 'financesonline.com',
  'EN2-14 Sitejabber': 'www.sitejabber.com', 'EN2-15 GitHub Issues': 'github.com', 'EN2-16 ProductReview.com.au': 'www.productreview.com.au',
  'EN3-01 Mastodon(mastodon.social)': 'mastodon.social', 'EN3-02 Bluesky': 'bsky.app', 'EN3-03 Lemmy(lemmy.world)': 'lemmy.world', 'EN3-04 Slashdot': 'slashdot.org',
  'EN3-05 Quora': 'www.quora.com', 'EN3-06 Medium': 'medium.com', 'EN3-07 Substack': 'substack.com', 'EN3-08 Tildes': 'tildes.net',
  'EN3-09 HubSpot Community': 'community.hubspot.com', 'EN3-10 Zoom Community': 'community.zoom.com', 'EN3-11 n8n': 'community.n8n.io', 'EN3-12 Make': 'community.make.com',
  'EN3-13 Airtable Community': 'community.airtable.com', 'EN3-14 GitHub Discussions': 'github.com', 'EN3-15 Telegram': 't.me', 'EN3-16 Canny': 'canny.io',
}
const out = []
for (const [label, host] of Object.entries(HOSTS)) {
  const row = { label, host, fetched_at: new Date().toISOString() }
  try {
    const res = await fetch(`https://${host}/robots.txt`, { headers: { 'user-agent': USER_AGENT }, redirect: 'follow', signal: AbortSignal.timeout(20000) })
    const body = await res.text()
    row.status = res.status
    row.final_url = res.url
    row.bytes = body.length
    if (res.status === 200 && !looksLikeMarkup(body) && new URL(res.url).pathname === '/robots.txt' && new URL(res.url).host === host) {
      const g = parseRobots(body)
      row.state_root = robotsVerdict(g, '/', PRODUCT_TOKEN)
      row.crawl_delay_sec = robotsCrawlDelaySec(g, PRODUCT_TOKEN)
      row.body = body.slice(0, 6000)
    } else {
      row.state_root = { state: 'unverified', reason: `status=${res.status} markup=${looksLikeMarkup(body)} final=${res.url}` }
      row.body_head = body.slice(0, 200)
    }
  } catch (e) {
    row.error = String(e.message ?? e)
    row.state_root = { state: 'unverified', reason: 'request failed' }
  }
  out.push(row)
  console.log(`${label.padEnd(32)} ${String(row.status ?? row.error).padEnd(5)} ${row.state_root.state.padEnd(11)} delay=${row.crawl_delay_sec ?? '-'} ${row.state_root.reason}`.slice(0, 160))
  await new Promise((r) => setTimeout(r, 4000))
}
fs.writeFileSync('reports/2026-10-14/robots-originals-v70.json', JSON.stringify(out, null, 1) + '\n')
console.log('saved', out.length)
