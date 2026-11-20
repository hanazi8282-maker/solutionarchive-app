#!/usr/bin/env node
// source-discover 셀프테스트 — 네트워크·DB 0. 지문·라벨·안전장치(차단 즉시 중단·요청 ≤5·상한)를 가짜 fetch 로 잠근다.
import { aiSignal, fingerprint, legalLabel, planHosts, probeHost, rootDomain, tosExcerpt } from './source-discover.mjs'

let pass = 0, fail = 0
const eq = (n, a, b) => { JSON.stringify(a) === JSON.stringify(b) ? pass++ : (fail++, console.log(`❌ ${n}\n  기대 ${JSON.stringify(b)}\n  실제 ${JSON.stringify(a)}`)) }

eq('discourse', fingerprint('<meta name="generator" content="Discourse 3.2">'), 'discourse')
eq('xenforo', fingerprint('<html id="XF" lang="en">'), 'xenforo')
eq('phpbb', fingerprint('<a href="./viewforum.php?f=3">'), 'phpbb')
eq('gnuboard', fingerprint('<a href="/bbs/board.php?bo_table=free">'), 'gnuboard')
eq('xe', fingerprint('<a href="/index.php?mid=board">'), 'xe')
eq('insided', fingerprint('', 'community.foo.insided.com'), 'insided')
eq('지문 없음', fingerprint('<html><body>hello</body></html>'), null)

eq('AI 봇 차단', aiSignal('User-agent: GPTBot\nDisallow: /\n'), 'AI 봇 이름 차단(GPTBot)')
eq('Content-Signal', aiSignal('Content-Signal: ai-train=no\nUser-agent: *\nAllow: /'), 'Content-Signal 있음')
eq('신호 없음', aiSignal('User-agent: *\nAllow: /'), null)

eq('라벨 robots 금지', legalLabel({ robots: 'disallowed', tos: 'no_ban_found' }), 'forbids_automation')
eq('라벨 약관 금지', legalLabel({ robots: 'allowed', tos: 'forbids_automation' }), 'forbids_automation')
eq('라벨 약관 못 읽음 = 허용 아님', legalLabel({ robots: 'allowed', tos: 'unknown' }), 'unverified')
eq('라벨 robots 못 읽음', legalLabel({ robots: 'unverified', tos: 'no_ban_found' }), 'unverified')
eq('라벨 깨끗', legalLabel({ robots: 'allowed', tos: 'no_ban_found' }), 'allowed')
eq('약관 발췌', tosExcerpt('<p>You may not use any web crawler to access.</p>')?.includes('web crawler'), true)

eq('rootDomain', [rootDomain('https://www.foo.co.kr/x'), rootDomain('app.bar.com'), rootDomain('nonsense')], ['foo.co.kr', 'bar.com', null])
eq('planHosts 상한·제외', planHosts({ homepages: ['https://a.com', 'https://b.com'], manual: ['m.org'], tried: ['community.a.com'], max: 3 }), ['m.org', 'community.b.com', 'forum.a.com'])

// 가짜 fetch: 경로별 응답 + 요청 수 기록
const site = (map) => { const calls = []; return { calls, get: async (url) => { calls.push(url); const p = new URL(url).pathname; return map[p] ?? { status: 404, text: 'nf' } } } }
const topics = JSON.stringify({ topic_list: { topics: Array.from({ length: 12 }, (_, i) => ({ id: i })) } })
let s = site({ '/robots.txt': { status: 200, text: 'User-agent: *\nAllow: /\n' }, '/': { status: 200, text: '<meta name="generator" content="Discourse">' }, '/latest.json': { status: 200, text: topics }, '/tos': { status: 200, text: 'x'.repeat(300) + ' no bans here ' + 'y'.repeat(100) } })
let r = await probeHost(s.get, 'community.a.com')
eq('Discourse 후보: 라벨 allowed·가능', [r.outcome, r.row.legal_label, r.row.tech_feasible, r.row.onboarded_source_key], ['candidate', 'allowed', true, null])
eq('요청 ≤ 5', r.requests <= 5 && s.calls.length === r.requests, true)

s = site({ '/robots.txt': { status: 200, text: 'User-agent: *\nDisallow: /\n' } })
r = await probeHost(s.get, 'forum.b.com')
eq('robots 금지 → 첫 화면 요청 0', [r.outcome, r.row.legal_label, s.calls.length], ['robots_disallowed', 'forbids_automation', 1])

s = site({ '/robots.txt': { status: 200, text: 'User-agent: *\nAllow: /\n' }, '/': { status: 403, text: 'x' } })
r = await probeHost(s.get, 'forum.c.com')
eq('403 → 호스트 즉시 중단·blocked 기록', [r.outcome, r.row.tech_feasible, s.calls.length], ['blocked', false, 2])

s = site({ '/robots.txt': { status: 429, text: '' } })
r = await probeHost(s.get, 'forum.d.com')
eq('429 → 실행 전체 중단 신호', [r.outcome, r.abort], ['blocked', true])

s = site({ '/robots.txt': { status: 200, text: 'User-agent: *\nAllow: /\n' }, '/': { status: 200, text: '<html>plain site</html>' } })
r = await probeHost(s.get, 'forum.e.com')
eq('지문 없음 → 행 없음(source_candidates 에 안 적음)', [r.outcome, r.row], ['no_fingerprint', undefined])

s = site({ '/robots.txt': { status: 404, text: '' }, '/': { status: 200, text: '<html id="XF">' } })
r = await probeHost(s.get, 'forum.f.com')
eq('robots 404 → unverified(허용 아님)·어댑터 필요', [r.row.robots_status, r.row.legal_label, r.row.tech_feasible], ['unverified', 'unverified', null])

console.log(`source-discover selftest: ${pass} pass · ${fail} fail`)
process.exit(fail ? 1 : 0)
