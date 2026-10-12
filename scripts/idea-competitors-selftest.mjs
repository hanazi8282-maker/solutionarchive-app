#!/usr/bin/env node
// idea-competitors.mjs 셀프테스트 — 네트워크 없이(가짜 fetchText). 부품(키워드·제목 파싱·부류) + 경계(약관·robots 게이트 → 요청 수) + 정적 검사.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ideaKeywords, showHnName, parseHnShow, classify, main, SOURCES, REQUEST_GAP_MS, FETCH_TIMEOUT_MS } from './idea-competitors.mjs'

let pass = 0
let fail = 0
const t = (name, ok) => (ok ? pass++ : (fail++, console.error(`✗ ${name}`)))
const NOW = new Date('2026-10-12T00:00:00Z')

// ── 키워드 ──
const kw = ideaKeywords('AI meeting notes for small sales teams')
t('키워드: 영문 구(불용어 사이) 먼저 · 단어 뒤 · 최대 4', kw[0] === 'meeting notes' && kw.includes('sales teams') && kw.length <= 4 && !kw.includes('for'))
t('키워드: 한글 조사·접미 떼기 · "서비스" 같은 일반어는 빠진다', ideaKeywords('쇼핑몰의 리뷰를 자동화하는 서비스').join() === '쇼핑몰,리뷰,자동화')
t('키워드: 빈 아이디어 → 0개', ideaKeywords('   ').length === 0)

// ── Show HN 제목 ──
t('제목: "Show HN: Foo – desc" → Foo', showHnName('Show HN: Keen Bean – Mac meeting notes') === 'Keen Bean' && showHnName('Show HN: Witful, meeting notes') === 'Witful')
t('제목: 설명 문구·숫자 시작·% 는 이름 아님', showHnName('Show HN: AI meeting notes – no bot') === null && showHnName('Show HN: 100% Free, private notes') === null && showHnName('Show HN: Local meeting notes transcriber, but linuxy') === null)
t('제목: Show HN 아니면 null', showHnName('Ask HN: what do you use') === null)

// ── 응답 파싱 ──
const body = JSON.stringify({ hits: [
  { objectID: '1', title: 'Show HN: Snibb – notes', url: 'https://snibb.io', created_at: '2026-09-12T00:00:00Z', points: 10, num_comments: 3 },
  { objectID: '2', title: 'Show HN: Plorbo - old tool', url: null, created_at: '2025-01-01T00:00:00Z', points: 1, num_comments: 0 },
  { objectID: '3', title: 'Show HN: AI meeting notes for you', created_at: '2026-10-01T00:00:00Z' },
] })
const ph = parseHnShow(body, { keyword: 'notes', now: NOW })
t('파싱: 이름 있는 것만 · 날짜 경과 · 근거 hn:id', ph.ok && ph.total === 3 && ph.items.length === 2 && ph.items[0].days === 30 && ph.items[0].evidence.input_id === 'hn:1' && ph.items[0].domain === 'snibb')
t('파싱: hits 없음·JSON 아님 = 실패(0건 아님)', !parseHnShow('{}', { now: NOW }).ok && !parseHnShow('<html>', { now: NOW }).ok)

// ── 부류 ──
const reg = new Map([['plorbo', 'dictionary']])
const cl = classify([...ph.items, { ...ph.items[0], keyword: 'other' }, { ...ph.items[0], name: 'Zoom', key: 'zoom', domain: null }], { registry: reg, anchorKeys: new Set(['zoom']), maxDays: 90, area: '1' })
const c = (k) => cl.find((r) => r.key === k)
t('부류: ≤90일 new · 오래됨 small · 기준점 anchor', c('snibb').tier === 'new' && c('plorbo').tier === 'small' && c('zoom').tier === 'anchor' && c('zoom').status === 'benchmark')
t('부류: 같은 이름은 합치고 키워드 모음 · 이미 앎 표시 · 영역', c('snibb').keywords.sort().join() === 'notes,other' && c('plorbo').known === 'dictionary' && c('snibb').known === null && c('snibb').area === '1')
t('부류: 비교 한 장이 읽는 모양(status idea_found · evidence · tier)', c('snibb').status === 'idea_found' && Array.isArray(c('snibb').evidence) && typeof c('snibb').score === 'number')

// ── 경계: 약관·robots 게이트 ──
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'idea-'))
const calls = []
const fakeFetch = (robots) => async (url) => {
  calls.push(url)
  if (url.endsWith('/robots.txt')) return robots
  return { status: 200, body, finalUrl: url }
}
const waits = []
const base = { now: NOW, reportsDir: tmp, log: () => {}, fileRegistry: { dictionary: [], areaMapSlugs: [] }, wait: async (ms) => void waits.push(ms) }
calls.length = 0
const dry = await main(['--idea=AI meeting notes for small sales teams'], { ...base, fetchText: fakeFetch({ status: 404, body: '<html>', finalUrl: '' }) })
t('드라이런: 네트워크 0 · 파일 0', calls.length === 0 && dry.files === null && dry.requests === 0)
t('드라이런: 스토어 3곳은 약관으로 요청 0 표시', dry.plan.filter((p) => p.key !== 'hn_show').every((p) => p.result.startsWith('요청 0')))
calls.length = 0
const run = await main(['--idea=AI meeting notes for small sales teams', '--run', '--max-requests=2', '--area=1'], { ...base, fetchText: fakeFetch({ status: 404, body: '<html>', finalUrl: 'https://hn.algolia.com/robots.txt' }) })
t('run: 스토어 호스트에는 요청이 하나도 안 간다(robots 포함)', !calls.some((u) => /itunes|apple|play\.google|shopify/.test(u)))
t('run: HN 은 robots 404 기존 예외로 진행 · 상한 2', run.requests === 2 && calls.filter((u) => u.includes('/api/v1/search')).length === 2 && /상한 2/.test(run.plan.find((p) => p.key === 'hn_show').result))
t('run: 검색 요청 사이 간격 대기(첫 요청 앞은 없음)', waits.length === 1 && waits[0] > 0 && waits[0] <= REQUEST_GAP_MS)
// 재현(독립 재검토 #503): robots.txt 가 403·429 면 RobotsCache 는 '표식 있으면 통과'로 보지만, 예외 근거는 404 뿐 → 검색 요청 0.
for (const st of [403, 429]) {
  calls.length = 0
  const r = await main(['--idea=meeting notes', '--run'], { ...base, fetchText: fakeFetch({ status: st, body: '<html>blocked</html>', finalUrl: 'https://hn.algolia.com/robots.txt' }) })
  t(`run: robots.txt HTTP ${st} → 검색 요청 0 · 중단 사유`, r.requests === 0 && !calls.some((u) => u.includes('/api/v1/search')) && new RegExp(`robots.txt HTTP ${st}`).test(r.plan.find((p) => p.key === 'hn_show').result))
}
t('rawFetch 타임아웃 20초 상수', FETCH_TIMEOUT_MS === 20_000 && /AbortSignal\.timeout\(FETCH_TIMEOUT_MS\)/.test(fs.readFileSync(new URL('./idea-competitors.mjs', import.meta.url), 'utf8')))
t('run: 파일 2개(md·json tier_rows)', fs.existsSync(run.files.md) && Array.isArray(JSON.parse(fs.readFileSync(run.files.json, 'utf8')).tier_rows))
calls.length = 0
const blocked = await main(['--idea=meeting notes', '--run'], { ...base, fetchText: async (url) => (calls.push(url), url.endsWith('/robots.txt') ? { status: 200, body: 'User-agent: *\nDisallow: /api/\n', finalUrl: url } : { status: 200, body }) })
t('run: robots 가 금지로 바뀌면 검색 요청 0', blocked.requests === 0 && !calls.some((u) => u.includes('/api/v1/search')) && /robots disallowed/.test(blocked.plan.find((p) => p.key === 'hn_show').result))
const r429 = await main(['--idea=meeting notes', '--run'], { ...base, fetchText: async (url) => (url.endsWith('/robots.txt') ? { status: 404, body: '', finalUrl: url } : { status: 429, body: '' }) })
t('run: 429 는 즉시 중단(1요청)', r429.requests === 1 && /HTTP 429 — 중단/.test(r429.plan.find((p) => p.key === 'hn_show').result))
t('입력 검사: 아이디어 없으면 던진다', await main([], base).then(() => false, () => true))
t('소스 표: 약관 ok 는 HN 하나뿐', SOURCES.filter((s) => s.tos === 'ok').map((s) => s.key).join() === 'hn_show')

// ── 정적 검사 ──
const src = fs.readFileSync(new URL('./idea-competitors.mjs', import.meta.url), 'utf8')
t('정적: DB 접근 0(supabase·.from( 없음)', !/supabase|\.from\(/.test(src))
t('정적: LLM 호출 없음', !/anthropic|gemini|claude-cli|messages\.create/i.test(src.replace(/^\s*\/\/.*$/gm, '')))
t('정적: 파일 쓰기는 md·json 두 곳', (src.match(/writeFileSync\(/g) ?? []).length === 2)

fs.rmSync(tmp, { recursive: true, force: true })
console.log(`\n${fail === 0 ? '✅' : '❌'} 아이디어→경쟁 서비스 셀프테스트: ${pass} pass / ${fail} fail`)
process.exit(fail === 0 ? 0 : 1)
