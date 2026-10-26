#!/usr/bin/env node
// 자율 발굴 C-1 ②④ 셀프테스트. 네트워크·DB 없음 — 가짜 fetch(robots.txt 만).
//   키워드 확장 · 조합 결정성 · 오늘 몫(영역별 상한·순환) · 게이트 3상태(약관 금지·확인 불가·robots) · 소유자 예외를 검색에 안 넓힘 ·
//   검색 URL 은 한 번도 요청하지 않음 · 쓰기 경로 0(정적) · 영역 코드 = config/areas.json.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { combos, dailyPick, expandKeywords, searchUrl, storeGate } from '../lib/discovery/store-search.ts'
import { main, plan, robotsFor } from './store-search-discovery.mjs'

let pass = 0
let fail = 0
const t = (name, actual, expected) => {
  if (Object.is(actual, expected)) pass++
  else {
    fail++
    console.log(`❌ ${name} — 기대 ${JSON.stringify(expected)} / 실제 ${JSON.stringify(actual)}`)
  }
}
const cfg = JSON.parse(fs.readFileSync('config/discovery-c1.json', 'utf8'))
const areas = JSON.parse(fs.readFileSync('config/areas.json', 'utf8')).areas

// ④ 키워드·조합
t('expand: seed×mod, dedupe', expandKeywords(['CRM', 'crm'], ['', 'app']).join('|'), 'CRM|CRM app')
t('expand: empty modifiers = seeds', expandKeywords(['a b'], []).join('|'), 'a b')
t('url: encode q', searchUrl('https://x/?q={q}&gl={COUNTRY}&hl={hl}', { q: '회의 록', country: 'kr', sort: null, lang: 'ko' }), 'https://x/?q=%ED%9A%8C%EC%9D%98%20%EB%A1%9D&gl=KR&hl=ko')
let threw = false
try { searchUrl('https://x/?q={q}&z={zz}', { q: 'a', country: null, sort: null, lang: 'en' }) } catch { threw = true }
t('url: leftover placeholder throws', threw, true)
const c1 = combos(cfg, '1')
t('combos: deterministic', JSON.stringify(combos(cfg, '1')), JSON.stringify(c1))
t('combos: unknown area = []', combos(cfg, 'zzz').length, 0)
t('combos: shopify en only', c1.filter((c) => c.store === 'shopify_apps').every((c) => c.lang === 'en' && c.country === null), true)
t('combos: shopify sorts both', new Set(c1.filter((c) => c.store === 'shopify_apps').map((c) => c.sort)).size, 2)
t('combos: appstore ko → kr only', c1.filter((c) => c.store === 'appstore' && c.lang === 'ko').every((c) => c.country === 'kr'), true)
t('combos: appstore en countries', new Set(c1.filter((c) => c.store === 'appstore' && c.lang === 'en').map((c) => c.country)).size, cfg.countries.en.length)
// 개수 = 스토어별 Σ(키워드 × 국가 × 정렬)
const kws = (lang) => expandKeywords(cfg.areas['1'][lang], cfg.modifiers[lang]).length
const expect1 = Object.values(cfg.stores).reduce((n, s) => n + s.langs.reduce((m, l) => m + kws(l) * (s.countries ? cfg.countries[l].length : 1) * Math.max(1, s.sorts.length), 0), 0)
t('combos: count formula', c1.length, expect1)
t('config: area codes ⊂ areas.json', Object.keys(cfg.areas).every((a) => areas.some((x) => x.code === a)), true)

// 오늘 몫
const L = Array.from({ length: 10 }, (_, i) => i)
t('pick: cap', dailyPick(L, '2026-10-12', 3).length, 3)
t('pick: no dup', new Set(dailyPick(L, '2026-10-12', 3)).size, 3)
t('pick: cap > len → len', dailyPick([1, 2], '2026-10-12', 3).length, 2)
t('pick: rotates by day', dailyPick(L, '2026-10-12', 3).join() !== dailyPick(L, '2026-10-13', 3).join(), true)
const seen = new Set()
for (let d = 1; d <= 10; d++) for (const x of dailyPick(L, `2026-11-${String(d).padStart(2, '0')}`, 3)) seen.add(x)
t('pick: covers all within len days', seen.size, 10)
t('pick: empty', dailyPick([], '2026-10-12', 3).length, 0)
threw = false
try { dailyPick(L, '10/12', 3) } catch { threw = true }
t('pick: bad date throws', threw, true)

// 게이트
const ok = { key: 'x', enabled: true, tos_status: 'permitted' }
t('gate: clean + allowed = collect', storeGate(ok, 'allowed').mode, 'collect')
t('gate: no row = suggest', storeGate(undefined, 'allowed').mode, 'suggest')
t('gate: disabled = suggest', storeGate({ ...ok, enabled: false }, 'allowed').mode, 'suggest')
t('gate: prohibited = suggest', storeGate({ ...ok, tos_status: 'prohibited' }, 'allowed').mode, 'suggest')
t('gate: forbids_automation = suggest', storeGate({ ...ok, tos_status: 'forbids_automation' }, 'allowed').mode, 'suggest')
t('gate: tos null = suggest(확인 불가)', storeGate({ ...ok, tos_status: null }, 'allowed').reasons.join(), '약관 확인 불가(tos_status=null)')
t('gate: tos unverified = suggest', storeGate({ ...ok, tos_status: 'unverified' }, 'allowed').mode, 'suggest')
t('gate: silent + allowed = collect', storeGate({ ...ok, tos_status: 'silent' }, 'allowed').mode, 'collect')
t('gate: robots unverified = suggest', storeGate(ok, 'unverified').mode, 'suggest')
t('gate: robots null = suggest', storeGate(ok, null).mode, 'suggest')
t('gate: robots disallowed = suggest', storeGate(ok, 'disallowed').mode, 'suggest')
// 소유자 예외는 검색 경로로 넓히지 않는다 — storeGate 가 override·robots_status 칸을 **읽지조차 않는다**는 것을 증명:
// 두 칸에 접근하면 던지는 Proxy 를 넘긴다. 읽으면 예외가 나서 이 테스트가 깨진다.
const touched = []
const trap = new Proxy({ ...ok, override: 'owner_2026-10-05', robots_status: 'disallowed' }, {
  get(o, k) {
    if (k === 'override' || k === 'robots_status') { touched.push(k); throw new Error(`storeGate read ${String(k)}`) }
    return o[k]
  },
})
let gOver = null
try { gOver = storeGate(trap, 'disallowed') } catch (e) { gOver = { mode: `threw: ${e.message}` } }
t('gate: override never read', touched.join(), '')
t('gate: override+robots disallowed → suggest', gOver.mode, 'suggest')
// 같은 입력에서 override 유무가 결과를 바꾸지 않는다(허용 쪽 robots 에서도)
t('gate: override irrelevant (allowed)', JSON.stringify(storeGate({ ...ok, override: 'owner_2026-10-06' }, 'allowed')), JSON.stringify(storeGate(ok, 'allowed')))

// 계획: 영역별 상한
const areaCodes = ['1', '2', '3', '4', '5']
const p = plan({ cfg, sources: [], robots: {}, date: '2026-10-12', capPerArea: 3, areaCodes })
t('plan: per-area cap 3', Object.values(p.picks).every((l) => l.length === 3), true)
t('plan: all suggest without rows', Object.values(p.gates).every((g) => g.mode === 'suggest'), true)
t('plan: cap = product-name-discovery approval', JSON.parse(fs.readFileSync('config/product-name-discovery.json', 'utf8')).approval.daily_cap_per_area, 3)

// main: 실제 robots 원문(2026-10-12)으로 — 검색 URL 은 요청하지 않는다
const ROBOTS = {
  'itunes.apple.com': 'User-agent: *\nDisallow: /search*\nDisallow: /*/rss/*\nDisallow: /*/lookup?\n',
  'play.google.com': 'User-Agent: *\nAllow: /about\nDisallow: /store/search\n',
  'apps.shopify.com': 'User-agent: *\nDisallow: /internal/\nDisallow: *q=*\n',
  'www.producthunt.com': 'User-agent: *\nDisallow: /search*\n',
}
const asked = []
const fakeFetch = async (url) => {
  asked.push(url)
  const u = new URL(url)
  if (u.pathname === '/robots.txt' && ROBOTS[u.hostname]) return { status: 200, body: ROBOTS[u.hostname], finalUrl: url }
  return { status: 404, body: '', finalUrl: url }
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ssd-'))
const srcFile = path.join(tmp, 'sources.json')
fs.writeFileSync(srcFile, JSON.stringify([
  { key: 'appstore', enabled: true, tos_status: null, robots_status: 'disallowed' },
  { key: 'googleplay', enabled: true, tos_status: 'forbids_automation', robots_status: 'disallowed' },
  { key: 'shopify_apps', enabled: true, tos_status: 'prohibited', robots_status: 'allowed' },
]))
const logs = []
const r = await main([`--sources=${srcFile}`, '--date=2026-10-12', '--write', `--reports-dir=${tmp}`], { fetchText: fakeFetch, log: (l) => logs.push(l) })
t('main: only robots.txt requested', asked.every((u) => new URL(u).pathname === '/robots.txt'), true)
t('main: one robots per host', asked.length, 4)
t('main: robots disallowed ×4', Object.values(r.robots).every((s) => s === 'disallowed'), true)
t('main: collect 0', r.ready.length, 0)
t('main: producthunt no row → reason', r.gates.producthunt.reasons[0], 'review_sources 행 없음 — 약관 기록 확인 불가')
t('main: line has 0/4', /수집 가능 스토어 0\/4/.test(r.line), true)
t('main: file written', fs.existsSync(path.join(tmp, '2026-10-12', 'store-search-proposals.md')), true)
const md = fs.readFileSync(path.join(tmp, '2026-10-12', 'store-search-proposals.md'), 'utf8')
t('main: md has area heading', md.includes('## ① 회의록·통화 요약'), true)
t('robots: query rule seen (shopify *q=*)', await robotsFor('https://apps.shopify.com/search?q=crm&sort_by=newest', fakeFetch), 'disallowed')
t('robots: no query → allowed path', await robotsFor('https://apps.shopify.com/browse', fakeFetch), 'allowed')
t('robots: 404 → unverified', await robotsFor('https://nowhere.example/search?q=a', fakeFetch), 'unverified')
t('robots: html → unverified', await robotsFor('https://x.example/s', async () => ({ status: 200, body: '<html><body>hi</body></html>' })), 'unverified')
t('robots: cross-origin redirect → unverified', await robotsFor('https://x.example/s', async () => ({ status: 200, body: 'User-agent: *\nAllow: /\n', finalUrl: 'https://y.example/robots.txt' })), 'unverified')
const r2 = await main(['--date=2026-10-12', '--no-network'], { log: () => {} })
t('main: --no-network → robots null, suggest', Object.values(r2.gates).every((g) => g.mode === 'suggest') && r2.file === null, true)

// 정적: 쓰기 경로 0
const src = fs.readFileSync('scripts/store-search-discovery.mjs', 'utf8').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
t('static: no insert/update/upsert/delete', /\.(insert|update|upsert|delete)\(/.test(src), false)
t('static: only review_sources read', [...src.matchAll(/from\('([a-z_]+)'\)/g)].every((m) => m[1] === 'review_sources'), true)

fs.rmSync(tmp, { recursive: true, force: true })
console.log(`store-search-discovery selftest: ${pass} pass · ${fail} fail`)
process.exit(fail ? 1 : 0)
