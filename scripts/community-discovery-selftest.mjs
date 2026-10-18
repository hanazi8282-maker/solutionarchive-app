#!/usr/bin/env node
// community-discovery.mjs 셀프테스트 — 네트워크 0(가짜 fetch). DB 쓰기·import 0 을 정적으로도 확인한다.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  DAILY_NEW_CAP, REGISTERED, boardTargetsSql, boardsTsLines, classifyHost, keywordHitRate, makeFetcher, planCommunityDemotion,
  probeHost, rankCategories, runSubboards, sourceMigrationSql, tosVerdict,
} from './community-discovery.mjs'

let pass = 0, fail = 0
const eq = (name, a, b) => { const ok = JSON.stringify(a) === JSON.stringify(b); ok ? pass++ : (fail++, console.log(`❌ ${name}\n   기대 ${JSON.stringify(b)}\n   실제 ${JSON.stringify(a)}`)) }

// rankCategories: 제한 카테고리·하위·잡담·기존·작은 것 제외, 큰 순, 상한
const cats = [
  { id: 5, slug: 'feature-requests', topic_count: 900 }, { id: 6, slug: 'bugs', topic_count: 500 }, { id: 7, slug: 'lounge', topic_count: 5000 }, { id: 13, slug: 'jobs-freelance', topic_count: 4000 }, { id: 14, slug: 'feature-requests-done', topic_count: 4000 },
  { id: 8, slug: 'secret', topic_count: 800, read_restricted: true }, { id: 9, slug: 'tiny', topic_count: 10 }, { id: 10, slug: 'sub', topic_count: 700, parent_category_id: 5 },
  { id: 11, slug: 'help', topic_count: 1500 }, { id: 12, slug: 'Bad_Slug', topic_count: 999 },
]
eq('rankCategories 제외·정렬', rankCategories(cats, ['feature-requests']).map((c) => c.slug), ['help', 'bugs'])
eq('rankCategories path', rankCategories(cats, [])[0].path, '/c/help/11.json?order=created')
eq('rankCategories 상한', rankCategories(Array.from({ length: 20 }, (_, i) => ({ id: i + 1, slug: `s${i}`, topic_count: 300 + i })), []).length, DAILY_NEW_CAP)
eq('rankCategories 비배열', rankCategories(null, []), [])

// keywordHitRate: 못 쟀으면 null(0 아님)
eq('hit 비율', keywordHitRate(['Bug in export', 'Welcome', 'How to add', 'Hello'], ['bug', 'how to']), 0.5)
eq('hit 빈 입력은 null', keywordHitRate([], ['bug']), null)

// tosVerdict
eq('tos 금지', tosVerdict('x'.repeat(300) + ' You may not automate access to the forum, or monitor the forum, such as with a web crawler'), 'forbids_automation')
eq('tos 없음', tosVerdict('Be kind. '.repeat(60)), 'no_ban_found')
eq('tos 못 읽음', tosVerdict(''), 'unknown')

// classifyHost
const ok = { discourse: true, robots: 'allowed', tos: 'no_ban_found', rel: 0.6 }
eq('clean', classifyHost(ok).verdict, 'register_clean')
eq('약관 금지는 큐', classifyHost({ ...ok, tos: 'forbids_automation' }).verdict, 'queue')
eq('약관 불명은 큐', classifyHost({ ...ok, tos: 'unknown' }).verdict, 'queue')
eq('robots 불명은 큐', classifyHost({ ...ok, robots: 'unverified' }).verdict, 'queue')
eq('robots 금지는 반려', classifyHost({ ...ok, robots: 'disallowed' }).verdict, 'reject')
eq('적중 낮음 반려', classifyHost({ ...ok, rel: 0.39 }).verdict, 'reject')
eq('적중 정확히 40%는 통과', classifyHost({ ...ok, rel: 0.4 }).verdict, 'register_clean')
eq('Discourse 아님 반려', classifyHost({ ...ok, discourse: false }).verdict, 'reject')
eq('차단은 반려', classifyHost({ ...ok, blocked: 'x 429' }).verdict, 'reject')
eq('적중 못 쟀으면 큐', classifyHost({ ...ok, rel: null }).verdict, 'queue')

// 강등: 3일 지났고 신규 0 일 때만. 못 쟀으면(undefined) 강등 안 함
const t0 = new Date('2026-10-19T00:00:00Z')
eq('강등', planCommunityDemotion([{ source_key: 'a', registered_at: '2026-10-15T00:00:00Z' }, { source_key: 'b', registered_at: '2026-10-15T00:00:00Z' }, { source_key: 'c', registered_at: '2026-10-18T00:00:00Z' }, { source_key: 'd', registered_at: '2026-10-10T00:00:00Z' }], { a: 0, b: 7, c: 0 }, t0), ['a'])

// SQL 초안: 비파괴·멱등·롤백 존재
const m = sourceMigrationSql({ key: 'community_x', name: 'X', host: 'https://x.example', tos: 'no_ban_found', stamp: '20261019000090' })
eq('소스 SQL ON CONFLICT', /ON CONFLICT \(key\) DO NOTHING/.test(m.up) && !/UPDATE|DELETE/.test(m.up), true)
eq('소스 롤백은 타깃 있으면 중단', /RAISE EXCEPTION/.test(m.down), true)
const b = boardTargetsSql('n8n_community', '8ce7f2a3-df87-49fa-bd65-486ce8a45377', [{ slug: 'help', id: 1 }], '20261019000091')
eq('타깃 SQL 멱등·활성 소스 가드', /NOT EXISTS/.test(b.up) && /enabled\) <> 1/.test(b.up) && !/UPDATE|DELETE/.test(b.up), true)
eq('타깃 롤백은 수집 이력 있으면 지우지 않는다', /total_collected, 0\) > 0/.test(b.down), true)
eq('SQL 따옴표 이스케이프', sourceMigrationSql({ key: "a'b", name: "N'", host: 'h', tos: 'x', stamp: 's' }).up.includes("'a''b'"), true)
eq('boards 줄', boardsTsLines([{ slug: 'help', path: '/c/help/1.json?order=created' }, { slug: 'my-board', path: '/c/my-board/2.json?order=created' }]), "  help: '/c/help/1.json?order=created',\n  'my-board': '/c/my-board/2.json?order=created',")

// fetcher + probeHost (가짜 fetch)
const sleeps = []
const fake = (map) => async (url) => { const k = Object.keys(map).find((x) => url.endsWith(x)); const v = map[k] ?? { status: 404, body: '' }; return { status: v.status, text: async () => v.body } }
const getOf = (map) => makeFetcher({ fetchFn: fake(map), sleep: async (ms) => { sleeps.push(ms) }, gapMs: 3000 })
const good = {
  '/robots.txt': { status: 200, body: 'User-agent: *\nDisallow: /admin/\n' },
  '/categories.json': { status: 200, body: JSON.stringify({ category_list: { categories: cats } }) },
  '/latest.json': { status: 200, body: JSON.stringify({ topic_list: { topics: [{ title: 'Bug report' }, { title: 'Feature request: export' }, { title: 'Hello' }] } }) },
  '/tos': { status: 200, body: 'Be kind. '.repeat(60) },
}
const p = await probeHost(getOf(good), 'https://f.example', ['bug', 'feature'])
eq('probe 정상', [p.discourse, p.robots, p.tos, Math.round(p.rel * 100), p.blocked], [true, 'allowed', 'no_ban_found', 67, null])
eq('호스트당 간격 대기', sleeps.length > 0 && sleeps.every((s) => s <= 3000), true)
const pb = await probeHost(getOf({ ...good, '/categories.json': { status: 429, body: '' } }), 'https://f.example', ['bug'])
eq('429 는 그 자리에서 멈춘다(latest 요청 없음)', [pb.blocked, pb.titles.length], ['categories.json 429', 0])
const pe = await probeHost(getOf({ ...good, '/robots.txt': { status: 200, body: '' } }), 'https://f.example', ['bug'])
eq('빈 robots 200 은 차단 신호', pe.blocked, 'robots.txt 200')
const pn = await probeHost(getOf({ ...good, '/categories.json': { status: 200, body: '<html>nope</html>' } }), 'https://f.example', ['bug'])
eq('HTML 은 Discourse 아님', [pn.discourse, classifyHost(pn).verdict], [false, 'reject'])
const pd = await probeHost(getOf({ ...good, '/robots.txt': { status: 200, body: 'User-agent: *\nDisallow: /latest.json\n' } }), 'https://f.example', ['bug'])
eq('robots 금지면 categories 요청도 안 한다', [pd.robots, pd.discourse], ['disallowed', false])

// runSubboards: 가짜 fetch 로 6곳 → 후보
const hostMap = Object.fromEntries(Object.values(REGISTERED).map((c) => [`${c.host.replace('https://', '')}`, true]))
const get = makeFetcher({ fetchFn: async (u) => ({ status: 200, text: async () => JSON.stringify({ category_list: { categories: cats } }) }), sleep: async () => {}, gapMs: 0 })
const sb = await runSubboards({ get, projects: {}, write: false, dir: '' })
eq('서브보드 6곳 계획', sb.plans.length, Object.keys(REGISTERED).length)
eq('기존 slug 제외', sb.plans.find((x) => x.key === 'n8n_community').boards.map((c) => c.slug).includes('feature-requests'), false)

// 정적: DB·쓰기 도구 import 없음
const src = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'community-discovery.mjs'), 'utf8')
eq('DB 클라이언트 import 없음', /supabase|createClient|service_role|SUPABASE/i.test(src.replace(/\/\/.*$/gm, '').replace(/'[^']*review_sources[^']*'/g, '')), false)
eq('기존 워크플로·어댑터 파일을 쓰지 않는다', /writeFileSync\([^)]*(workflows|adapters)/.test(src), false)

console.log(`community-discovery selftest: ${pass} pass · ${fail} fail`)
process.exit(fail ? 1 : 0)
