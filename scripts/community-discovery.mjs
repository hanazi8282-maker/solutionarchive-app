#!/usr/bin/env node
// 자율 발굴 ④⑤ (남헌 v71au, 2026-10-19) — Discourse 계열 공개 포럼에서
//   ④ 새 커뮤니티 후보 발굴(--mode=communities)  ⑤ 이미 등록한 포럼의 미등록 서브보드 발굴(--mode=subboards).
//
// 요청: robots.txt · /categories.json · /latest.json · (약관 페이지 1장) 만, 호스트당 간격 3초. 로그인·검색·토픽 본문 요청 없음.
//   403·429·빈 본문·챌린지 HTML 이 한 번이라도 나오면 그 호스트는 그 자리에서 멈춘다(우회 없음) — 결과에 blocked 로 남는다.
// DB: 접근하지 않는다(프로젝트 id 는 --projects=<json> 으로 받는다). 쓰기는 파일뿐 —
//   reports/<KST>/community-candidates.md · community-sources-<stamp>.sql(+ -rollback.sql) · board-targets-<stamp>.sql(+ -rollback.sql)
//   ⛔ 초안만. 적용은 오케스트레이터(CLAUDE.md §10.1·§10.2). 어댑터 호스트는 상수여야 하므로(SSRF) 새 소스는 코드 PR 도 필요하다.
//
// 분류(CLAUDE.md §10.1 "새 소스"): robots 허용 ∧ 약관 자동수집 금지 문구 없음 ∧ 키워드 적중 ≥40% → register_clean(세션이 등록 가능)
//   약관 금지·확인 불가·robots 확인 불가 → queue(ops/state/source-review-queue.md) · robots 금지·Discourse 아님·적중 낮음 → reject(사유만 기록).
//
//   node scripts/community-discovery.mjs --mode=communities [--seeds=config/community-seeds.json] [--write] [--no-network]
//   node scripts/community-discovery.mjs --mode=subboards --projects=<json {source_key: project_id}> [--write]
// 종료 코드: 0 · 1(입력 실패)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  BUBBLE_FORUM_BOARDS, BUBBLE_FORUM_HOST, GLIDE_COMMUNITY_BOARDS, GLIDE_COMMUNITY_HOST, MAKE_COMMUNITY_BOARDS, MAKE_COMMUNITY_HOST,
  N8N_COMMUNITY_BOARDS, N8N_COMMUNITY_HOST, RETOOL_COMMUNITY_BOARDS, RETOOL_COMMUNITY_HOST, SOFTR_COMMUNITY_BOARDS, SOFTR_COMMUNITY_HOST,
} from '../lib/review/adapters/discourse.ts'
import { parseRobots, robotsVerdict } from '../lib/review/robots.ts'
import { PRODUCT_TOKEN, USER_AGENT } from '../lib/review/runner.ts'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const GAP_MS = 3000
export const DAILY_NEW_CAP = 5 // v71au ④: 소스당 하루 신규 후보 상한
export const MIN_REL = 0.4 // v71au ④: 샘플 20건 키워드 적중 ≥40%
export const MIN_TOPICS = 200
const q = (s) => `'${String(s).replace(/'/g, "''")}'`
const kstDate = (now = new Date()) => new Date(now.getTime() + 9 * 3600e3).toISOString().slice(0, 10)

/** 등록된 Discourse 소스: key → {host, boards}. 호스트·게시판 표의 정본은 lib/review/adapters/discourse.ts 다. */
export const REGISTERED = {
  n8n_community: { host: N8N_COMMUNITY_HOST, boards: N8N_COMMUNITY_BOARDS },
  make_community: { host: MAKE_COMMUNITY_HOST, boards: MAKE_COMMUNITY_BOARDS },
  bubble_forum: { host: BUBBLE_FORUM_HOST, boards: BUBBLE_FORUM_BOARDS },
  retool_community: { host: RETOOL_COMMUNITY_HOST, boards: RETOOL_COMMUNITY_BOARDS },
  glide_community: { host: GLIDE_COMMUNITY_HOST, boards: GLIDE_COMMUNITY_BOARDS },
  softr_community: { host: SOFTR_COMMUNITY_HOST, boards: SOFTR_COMMUNITY_BOARDS },
}
// 잡담·공지·메타 카테고리는 VOC 가 아니다.
const SKIP_SLUG = /^(uncategorized|meta|staff|general|discussion|lounge|welcome|introductions?)$|announce|feedback|off-?topic|chat|showcase|built-with|jobs?|freelance|hiring|archive|news|events?|marketplace|release|changelog|tips|resources|beta|on-prem|done$|community-|meetups?|blog|convos|plugin|account|entrepreneurship|coding/i

// ── 순수 ─────────────────────────────────────────────

/** /categories.json 의 category_list.categories[] → 새로 등록할 서브보드 후보(topic_count 큰 순, 하루 상한). */
export function rankCategories(categories, existingSlugs, { minTopics = MIN_TOPICS, cap = DAILY_NEW_CAP } = {}) {
  const have = new Set(existingSlugs)
  return (Array.isArray(categories) ? categories : [])
    .filter((c) => c && typeof c.slug === 'string' && Number.isInteger(c.id) && !c.read_restricted && (c.topic_count ?? 0) >= minTopics)
    .filter((c) => /^[a-z0-9][a-z0-9-]{0,39}$/.test(c.slug) && !SKIP_SLUG.test(c.slug) && !have.has(c.slug) && !c.parent_category_id)
    .sort((a, b) => b.topic_count - a.topic_count)
    .slice(0, cap)
    .map((c) => ({ slug: c.slug, id: c.id, topic_count: c.topic_count, path: `/c/${c.slug}/${c.id}.json?order=created` }))
}

/** 영역 키워드(config/discovery-c1.json areas) 중 하나라도 제목에 들어 있으면 적중. 판정이 아니라 사전 거름망이다(최종 관련성은 T1~T4). */
export function keywordHitRate(titles, keywords) {
  const ks = keywords.map((k) => k.toLowerCase()).filter(Boolean)
  if (!titles.length || !ks.length) return null // 못 쟀다(§7.1) — 0 으로 접지 않는다
  return titles.filter((t) => ks.some((k) => String(t).toLowerCase().includes(k))).length / titles.length
}

/** 약관 본문 → forbids_automation | no_ban_found | unknown. 못 읽었으면 unknown(허용 아님). */
export function tosVerdict(text) {
  if (typeof text !== 'string' || text.trim().length < 200) return 'unknown'
  return /(automate access|web crawler|crawl(s|ing|er)?\b|scrap(e|es|ing)\b|spider|bots?\b.*not (permitted|allowed))/i.test(text) ? 'forbids_automation' : 'no_ban_found'
}

/** 한 호스트의 실측 → 분류. robots: allowed|disallowed|unverified. */
export function classifyHost({ discourse, robots, tos, rel, blocked }) {
  if (blocked) return { verdict: 'reject', reason: `차단 신호(${blocked}) — 즉시 중단, 우회 없음` }
  if (!discourse) return { verdict: 'reject', reason: 'Discourse 공개 JSON 이 아니다(/categories.json 에 category_list 없음)' }
  if (robots === 'disallowed') return { verdict: 'reject', reason: 'robots 가 /categories.json·/latest.json 금지' }
  if (robots !== 'allowed') return { verdict: 'queue', reason: 'robots 확인 불가(허용이 아니다, §7.1)' }
  if (rel === null) return { verdict: 'queue', reason: '키워드 적중률을 못 쟀다(최신 글 없음)' }
  if (rel < MIN_REL) return { verdict: 'reject', reason: `키워드 적중 ${Math.round(rel * 100)}% < ${MIN_REL * 100}%` }
  if (tos === 'forbids_automation') return { verdict: 'queue', reason: '약관에 자동 접근 금지 문구 — 남헌 판단 큐(§10.1)' }
  if (tos !== 'no_ban_found') return { verdict: 'queue', reason: '약관을 못 읽었다 — 확인 불가는 큐' }
  return { verdict: 'register_clean', reason: `robots 허용 · 약관 금지 문구 없음 · 적중 ${Math.round(rel * 100)}%` }
}

/** 임시 등록한 커뮤니티 중 3일 관찰 뒤 신규 0 → 강등 대상. entries: {source_key, registered_at}, newBy3d: {source_key: n} */
export function planCommunityDemotion(entries, newBy3d, now = new Date()) {
  return entries.filter((e) => now - new Date(e.registered_at) >= 3 * 86400e3 && (newBy3d[e.source_key] ?? null) === 0).map((e) => e.source_key)
}

/** 새 소스 등록 마이그 초안(소스 행 + 램프 50% 출발). 타깃은 어댑터 코드가 main 에 오른 뒤 boardTargetsSql 로 따로. */
export function sourceMigrationSql({ key, name, host, tos, stamp }) {
  const forbids = tos === 'forbids_automation'
  return {
    up: [
      `-- ${stamp}_${key}_source — 커뮤니티 발굴(v71au ④) 소스 등록 초안. ⛔ 미적용. 코드 짝: lib/review/adapters/discourse.ts 팩토리 호출 1줄 + scripts/review-collect.mjs ADAPTERS 1줄 + lib/review/target-ref.ts.`,
      `-- 근거: ${host} robots 허용, 약관 ${tos}. 롤백: ${stamp}_${key}_source_rollback.sql`, 'BEGIN;',
      `INSERT INTO public.review_sources (key, display_name, enabled, health, min_interval_ms, daily_request_cap, robots_status, tos_status, override, quote_policy, quote_allowed, citation_allowed, privacy_check, last_test_result)`,
      `VALUES (${q(key)}, ${q(name)}, true, 'ok', 6000, 40, 'allowed', ${q(forbids ? 'forbids_automation' : 'unverified')}, NULL, 'none', false, true, '낮음 — 공개 포럼. 사용자명·프로필·아바타는 읽지도 저장하지도 않는다.', ${q(`${kstDate()} community-discovery 실측: robots 허용`)})`,
      `ON CONFLICT (key) DO NOTHING;`,
      `INSERT INTO public.review_source_ramp (source_key, level, targets_per_run, reason, pct_step, cap_base, daily_request_target)`,
      `VALUES (${q(key)}, 0, 2, 'v71au ④ — 새 소스 50% 출발', 50, 40, 20) ON CONFLICT (source_key) DO NOTHING;`, 'COMMIT;', '',
    ].join('\n'),
    down: [`-- ${stamp}_${key}_source 롤백 — 타깃이 있으면 중단.`, 'BEGIN;',
      `DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.review_targets WHERE source_key = ${q(key)}) THEN RAISE EXCEPTION '${key} 타깃이 있다 — 먼저 지운다'; END IF; END $$;`,
      `DELETE FROM public.review_source_ramp WHERE source_key = ${q(key)};`, `DELETE FROM public.review_sources WHERE key = ${q(key)};`, 'COMMIT;', ''].join('\n'),
  }
}

/** 서브보드 타깃 INSERT 초안. 같은 (source_key, product_ref) 가 있으면 건너뛴다. 이 SQL 은 boards 표(코드)가 main 에 오른 뒤 적용한다. */
export function boardTargetsSql(sourceKey, projectId, boards, stamp) {
  const rows = boards.map((b) => `(${q(sourceKey)}, ${q(`board:${b.slug}`)}, ${q(`${sourceKey}: ${b.slug}`)})`).join(',\n    ')
  return {
    up: [`-- ${stamp}_${sourceKey}_boards — 서브보드 ${boards.length}개 타깃 등록 초안(v71au ⑤). ⛔ 미적용 · 코드 짝: discourse.ts 의 ${sourceKey} boards 표(같은 slug).`, 'BEGIN;',
      `DO $$ BEGIN IF (SELECT count(*) FROM public.review_sources WHERE key = ${q(sourceKey)} AND enabled) <> 1 THEN RAISE EXCEPTION '${sourceKey} 없음/비활성 — 타깃을 넣지 않는다(§10.1)'; END IF; END $$;`,
      `INSERT INTO public.review_targets (project_id, source_key, product_ref, label, cursor, status)`,
      `SELECT ${q(projectId)}::uuid, v.src, v.ref, v.label, NULL, 'active' FROM (VALUES`, `    ${rows}`, `) AS v(src, ref, label)`,
      `WHERE NOT EXISTS (SELECT 1 FROM public.review_targets t WHERE t.source_key = v.src AND t.product_ref = v.ref);`, 'COMMIT;', ''].join('\n'),
    down: [`-- ${stamp}_${sourceKey}_boards 롤백 — 이 마이그가 넣은 board 타깃만, 수집 이력(total_collected>0)이 있으면 비활성만.`, 'BEGIN;',
      `UPDATE public.review_targets SET status = 'exhausted' WHERE source_key = ${q(sourceKey)} AND product_ref IN (${boards.map((b) => q(`board:${b.slug}`)).join(', ')}) AND COALESCE(total_collected, 0) > 0;`,
      `DELETE FROM public.review_targets WHERE source_key = ${q(sourceKey)} AND product_ref IN (${boards.map((b) => q(`board:${b.slug}`)).join(', ')}) AND COALESCE(total_collected, 0) = 0;`, 'COMMIT;', ''].join('\n'),
  }
}

/** discourse.ts 의 boards 표에 끼워 넣을 줄. 오케스트레이터/세션이 붙여 넣는다(호스트 상수 정책상 자동 편집 안 함). */
export function boardsTsLines(boards) {
  return boards.map((b) => `  ${/^[a-z]+$/.test(b.slug) ? b.slug : `'${b.slug}'`}: '${b.path}',`).join('\n')
}

// ── 네트워크 ─────────────────────────────────────────

export function makeFetcher({ fetchFn = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), gapMs = GAP_MS } = {}) {
  const last = new Map()
  return async function get(url) {
    const host = new URL(url).host
    const wait = (last.get(host) ?? 0) + gapMs - Date.now()
    if (wait > 0) await sleep(wait)
    last.set(host, Date.now())
    try {
      const r = await fetchFn(url, { headers: { 'user-agent': USER_AGENT, accept: 'application/json,text/html,text/plain' }, redirect: 'follow', signal: AbortSignal.timeout(20000) })
      return { status: r.status, text: await r.text() }
    } catch (e) {
      return { status: 0, text: '', error: String(e?.cause?.code ?? e?.message ?? e) }
    }
  }
}

const isBlock = (r) => r.status === 403 || r.status === 429 || (r.status === 200 && !r.text.trim())
const tryJson = (t) => { try { return JSON.parse(t) } catch { return null } }

/** 호스트 하나 프로브. 반환: 분류에 필요한 실측 전부. 차단이면 그 자리에서 멈춘다. */
export async function probeHost(get, host, keywords, { tosPath = '/tos' } = {}) {
  const out = { host, discourse: false, robots: 'unverified', tos: 'unknown', rel: null, titles: [], categories: [], blocked: null, note: '' }
  const rb = await get(`${host}/robots.txt`)
  if (rb.status === 0) return { ...out, note: `접속 불가(${rb.error})` }
  if (isBlock(rb)) return { ...out, blocked: `robots.txt ${rb.status}` }
  if (rb.status === 200) {
    const groups = parseRobots(rb.text)
    const v = ['/categories.json', '/latest.json'].map((p) => robotsVerdict(groups, p, PRODUCT_TOKEN).state)
    out.robots = v.every((s) => s === 'allowed') ? 'allowed' : v.includes('disallowed') ? 'disallowed' : 'unverified'
  }
  if (out.robots === 'disallowed') return out
  const cat = await get(`${host}/categories.json`)
  if (isBlock(cat)) return { ...out, blocked: `categories.json ${cat.status}` }
  const cj = tryJson(cat.text)
  const cats = cj?.category_list?.categories
  if (cat.status !== 200 || !Array.isArray(cats)) return { ...out, note: `categories.json ${cat.status}` }
  out.discourse = true
  out.categories = cats
  const lt = await get(`${host}/latest.json`)
  if (isBlock(lt)) return { ...out, blocked: `latest.json ${lt.status}` }
  const topics = tryJson(lt.text)?.topic_list?.topics
  if (Array.isArray(topics)) {
    out.titles = topics.slice(0, 20).map((t) => String(t.title ?? ''))
    out.rel = keywordHitRate(out.titles, keywords)
  }
  const tp = await get(`${host}${tosPath}`)
  if (isBlock(tp)) return { ...out, blocked: `${tosPath} ${tp.status}` }
  out.tos = tp.status === 200 ? tosVerdict(tp.text.replace(/<[^>]+>/g, ' ')) : 'unknown'
  return out
}

// ── 실행 ─────────────────────────────────────────────

// 제품 포럼 제목의 VOC 신호 낱말(불만·요청·질문). 영역 씨앗만으로는 제품명 제목을 못 잡는다.
// ponytail: 제목 낱말 매칭이라 정밀도 낮다 — 진짜 관련성은 T1~T4 가 가른다. 이 거름망은 '글 없는 죽은 포럼'과 공지판만 거른다.
export const VOC_WORDS = ['how to', 'how do', 'issue', 'bug', 'error', 'problem', "can't", 'cannot', 'not working', 'missing', 'feature', 'request', 'wish', 'please add', 'support for', 'why', 'help', 'question', 'alternative', 'pricing', 'cancel', 'slow', 'broken', '문제', '오류', '안 돼', '안됨', '기능', '요청', '추천', '대안', '질문', '방법']

function areaKeywords(area) {
  const cfg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'config/discovery-c1.json'), 'utf8')).areas
  const a = cfg[String(area)] ?? {}
  // 영역 씨앗 + 영역 공통 불만 낱말(제목 거름망). 단어 단위로 쪼개 부분 일치율을 높인다.
  return [...new Set([...(a.en ?? []), ...(a.ko ?? [])].flatMap((p) => [p, ...p.split(/\s+/).filter((w) => w.length >= 4)]).concat(VOC_WORDS))]
}

export async function runCommunities({ seeds, get, write, dir, now = new Date() }) {
  const rows = []
  for (const s of seeds) {
    const p = await probeHost(get, s.host, areaKeywords(s.area), { tosPath: s.tos_path ?? '/tos' })
    rows.push({ ...s, ...p, ...classifyHost(p) })
  }
  const md = communitiesMarkdown(rows, now)
  if (write) {
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'community-candidates.md'), md)
    const stamp = now.toISOString().replace(/[-:]/g, '').slice(0, 8) + '000090'
    const clean = rows.filter((r) => r.verdict === 'register_clean')
    for (const r of clean) {
      const key = r.key
      const m = sourceMigrationSql({ key, name: r.name, host: r.host, tos: r.tos, stamp })
      fs.writeFileSync(path.join(dir, `community-source-${key}.sql`), m.up)
      fs.writeFileSync(path.join(dir, `community-source-${key}-rollback.sql`), m.down)
    }
  }
  return { rows, md }
}

export function communitiesMarkdown(rows, now = new Date()) {
  const by = (v) => rows.filter((r) => r.verdict === v)
  const line = (r) => `- ${r.name} (${r.host}) · 영역 ${r.area}/${r.lang} · robots ${r.robots} · 약관 ${r.tos} · 적중 ${r.rel === null ? '확인 불가' : Math.round(r.rel * 100) + '%'} · 서브보드 후보 ${r.discourse ? rankCategories(r.categories, [], {}).length : 0} — ${r.reason}${r.note ? ` (${r.note})` : ''}`
  return [
    `# 커뮤니티 후보 발굴 ${kstDate(now)} (④, community-discovery.mjs)`, '',
    `후보 ${rows.length} · 즉시 등록 가능 ${by('register_clean').length} · 큐 ${by('queue').length} · 반려 ${by('reject').length}. 요청: robots·categories·latest·약관, 호스트당 ${GAP_MS / 1000}초 간격, 로그인·검색 0.`, '',
    '## 즉시 등록 가능(register_clean — 코드 PR + 마이그 초안 필요)', ...(by('register_clean').map(line).concat(by('register_clean').length ? [] : ['- 없음'])), '',
    '## 큐(ops/state/source-review-queue.md — 사람 판단)', ...(by('queue').map(line).concat(by('queue').length ? [] : ['- 없음'])), '',
    '## 반려(사유만 기록)', ...(by('reject').map(line).concat(by('reject').length ? [] : ['- 없음'])), '',
  ].join('\n')
}

export async function runSubboards({ get, projects, write, dir, now = new Date() }) {
  const plans = []
  for (const [key, cfg] of Object.entries(REGISTERED)) {
    const cat = await get(`${cfg.host}/categories.json`)
    if (isBlock(cat)) { plans.push({ key, blocked: `categories.json ${cat.status}`, boards: [] }); continue }
    const cats = tryJson(cat.text)?.category_list?.categories
    if (cat.status !== 200 || !Array.isArray(cats)) { plans.push({ key, error: `categories.json ${cat.status}`, boards: [] }); continue }
    plans.push({ key, host: cfg.host, total: cats.length, boards: rankCategories(cats, Object.keys(cfg.boards)) })
  }
  const stamp = now.toISOString().replace(/[-:]/g, '').slice(0, 8) + '000091'
  const files = []
  if (write) {
    fs.mkdirSync(dir, { recursive: true })
    for (const p of plans.filter((x) => x.boards.length && projects?.[x.key])) {
      const m = boardTargetsSql(p.key, projects[p.key], p.boards, stamp)
      fs.writeFileSync(path.join(dir, `board-targets-${p.key}.sql`), m.up)
      fs.writeFileSync(path.join(dir, `board-targets-${p.key}-rollback.sql`), m.down)
      files.push(p.key)
    }
    fs.writeFileSync(path.join(dir, 'subboard-plan.md'), subboardMarkdown(plans, now))
  }
  return { plans, files }
}

export function subboardMarkdown(plans, now = new Date()) {
  const n = plans.reduce((s, p) => s + p.boards.length, 0)
  return [`# 서브보드 발굴 ${kstDate(now)} (⑤)`, '', `소스 ${plans.length}곳 · 미등록 서브보드 후보 ${n}개(topic_count ≥ ${MIN_TOPICS}, 소스당 하루 ${DAILY_NEW_CAP}).`, '',
    ...plans.flatMap((p) => [`## ${p.key}${p.blocked ? ` — 차단 ${p.blocked}` : p.error ? ` — ${p.error}` : ` (${p.host}, 카테고리 ${p.total})`}`,
      ...p.boards.map((b) => `- ${b.slug} (id ${b.id}, 토픽 ${b.topic_count}) → boards 줄: \`${boardsTsLines([b]).trim()}\``), ...(p.boards.length ? [] : ['- 새 후보 없음']), ''])].join('\n')
}

function arg(name, def) {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`))
  return a ? a.slice(name.length + 3) : def
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const mode = arg('mode', 'communities')
  const write = process.argv.includes('--write')
  const dir = path.join(repoRoot, arg('reports-dir', 'reports'), kstDate())
  const get = makeFetcher()
  if (mode === 'communities') {
    const seeds = JSON.parse(fs.readFileSync(path.join(repoRoot, arg('seeds', 'config/community-seeds.json')), 'utf8')).seeds
    const { md } = await runCommunities({ seeds, get, write, dir })
    console.log(md)
  } else if (mode === 'subboards') {
    const projects = arg('projects') ? JSON.parse(fs.readFileSync(arg('projects'), 'utf8')) : {}
    const { plans, files } = await runSubboards({ get, projects, write, dir })
    console.log(subboardMarkdown(plans))
    if (write) console.log(`마이그 초안: ${files.join(', ') || '없음(--projects 필요)'}`)
  } else { console.error('--mode=communities|subboards'); process.exit(1) }
}
