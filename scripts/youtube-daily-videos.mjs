#!/usr/bin/env node
// YouTube 매일 새 영상 발굴(v71ba P0-4) — 일회성 백필(20261019000020, 23개)을 "매일 지난 며칠 사이 올라온 영역 영상"으로 바꾸는 경로.
//
// 하는 일: 영역 씨앗(config/discovery-c1.json areas, 한/영) × 접미사(후기 / review)로 search.list 를 부른다 —
//   publishedAfter = 지금 − MAX_AGE_DAYS, publishedBefore = 지금 − MIN_AGE_DAYS(댓글이 붙을 시간을 준다), order=relevance.
//   → videos.list(id 50개당 1유닛)로 제목·댓글 수를 받아 **댓글 수 칸이 있고(=댓글 켜짐) ≥ MIN_COMMENTS** 인 것만 남긴다.
//   댓글 꺼진 영상은 403 commentsDisabled 로 소스 전체를 멈추게 한다(adapters/youtube.ts 🔴) — 그래서 이 거름이 필수다.
// 쿼터: search.list 는 10,000유닛 풀과 별개인 **하루 100회 버킷**이다(adapters/youtube.ts). 이 스크립트는 SEARCH_MAX(기본 24)회까지만 부른다.
//   videos.list 는 풀(10,000)에서 1~2유닛. 수집 쪽(commentThreads)은 하루 200유닛 상한이라 겹쳐도 여유가 크다.
// 쓰기: DB 0. --write 면 reports/<KST>/youtube-daily-<stamp>.sql(+ -rollback.sql) INSERT 초안만(⛔ 미적용, 적용은 오케스트레이터 §10.2).
//   이미 등록된 v: 는 --registered=<json 배열 파일>(예: SELECT product_ref FROM review_targets WHERE source_key='youtube')로 거르고,
//   SQL 자체도 NOT EXISTS 로 한 번 더 막는다(멱등).
// 키: YOUTUBE_API_KEY. 로그·파일·에러 문구에 키를 쓰지 않는다(URL 은 키를 뺀 모양으로만 찍는다).
//
//   node scripts/youtube-daily-videos.mjs [--registered=<file>] [--write] [--areas=1,2]
//   node scripts/youtube-daily-videos.mjs --selftest
// 종료: 0 · 1(입력 실패) · 2(키 없음·쿼터·API 오류 — 확인 불가)
// ponytail: 씨앗 × 접미사 하루 고정 순서. 버킷이 남으면 국가·정렬을 늘린다(창문 발굴처럼). 자동 적용(--run)은 무인 DB 쓰기라 사람·역할 세션 판단 뒤.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const API = 'https://www.googleapis.com/youtube/v3'
export const SEARCH_MAX = Math.min(90, Math.max(1, Number(process.env.YT_DAILY_SEARCH_MAX) || 24))
export const MIN_COMMENTS = 10
export const MIN_AGE_DAYS = 2
export const MAX_AGE_DAYS = 9
export const PER_QUERY = 3
const VID = /^[A-Za-z0-9_-]{11}$/
const q = (s) => `'${String(s).replace(/'/g, "''")}'`
const kstDate = (now) => new Date(now.getTime() + 9 * 3600e3).toISOString().slice(0, 10)

// ── 순수 ─────────────────────────────────────────────

/** 영역 씨앗 → 질의 목록 [{area, lang, q, seed}]. 영역 순서를 돌아가며 섞어 상한에 잘려도 한 영역이 독식하지 않는다. */
export function buildQueries(areas, { only = null, max = SEARCH_MAX } = {}) {
  const per = Object.entries(areas)
    .filter(([code]) => !only || only.includes(code))
    .map(([code, a]) => [...(a.ko ?? []).map((s) => ({ area: code, lang: 'ko', seed: s, q: `${s} 후기` })), ...(a.en ?? []).map((s) => ({ area: code, lang: 'en', seed: s, q: `${s} review` }))])
  const out = []
  for (let i = 0; out.length < max && per.some((l) => l[i]); i++) for (const l of per) if (l[i] && out.length < max) out.push(l[i])
  return out
}

/** search.list 주소(키 자리 KEY). */
export function searchUrl(query, now) {
  const after = new Date(now.getTime() - MAX_AGE_DAYS * 86400e3).toISOString().replace(/\.\d{3}Z$/, 'Z')
  const before = new Date(now.getTime() - MIN_AGE_DAYS * 86400e3).toISOString().replace(/\.\d{3}Z$/, 'Z')
  const p = new URLSearchParams({ part: 'id', type: 'video', order: 'relevance', maxResults: '10', q: query.q, publishedAfter: after, publishedBefore: before, relevanceLanguage: query.lang, regionCode: query.lang === 'ko' ? 'KR' : 'US' })
  return `${API}/search?${p}&key=KEY`
}

/** videos.list 응답 items → 채택 후보. 댓글 수 칸이 없으면(=댓글 꺼짐) 버린다. */
export function pickVideos(items, { registered = new Set(), min = MIN_COMMENTS } = {}) {
  const ok = []
  const skipped = { comments_off: 0, few_comments: 0, registered: 0, bad: 0 }
  for (const it of Array.isArray(items) ? items : []) {
    const id = it?.id
    if (typeof id !== 'string' || !VID.test(id)) { skipped.bad++; continue }
    if (registered.has(`v:${id}`)) { skipped.registered++; continue }
    const c = it?.statistics?.commentCount
    if (c === undefined || c === null) { skipped.comments_off++; continue }
    if (Number(c) < min) { skipped.few_comments++; continue }
    ok.push({ id, title: String(it?.snippet?.title ?? '').slice(0, 45), comments: Number(c), publishedAt: it?.snippet?.publishedAt ?? null })
  }
  return { ok, skipped }
}

/** INSERT 초안(20261019000020 과 같은 모양: 프로젝트 = 질의 씨앗 단위로 재사용, 타깃 = v:<id>). */
export function renderSql(rows, name) {
  if (!rows.length) return null
  for (const r of rows) if (!VID.test(r.id) || !/^[0-9a-z]{1,10}$/.test(r.area)) throw new Error(`행 형식 아님: ${JSON.stringify(r)}`)
  const vals = rows.map((r) => `  (${q(`v:${r.id}`)}, ${q(r.area)}, ${q(`${r.area}:yt|${r.title.replace(/[\r\n\\]/g, ' ')}·${r.comments}댓글`)}, ${q(`YouTube 영상 댓글 — ${r.seed}(매일 발굴)`)}, ${q(`https://www.youtube.com/watch?v=${r.id}`)})`)
  return `-- ${name}
-- ⛔ 미적용 초안 — scripts/youtube-daily-videos.mjs(v71ba P0-4 매일 새 영상)가 만들었다. 적용은 오케스트레이터 판단(CLAUDE.md §10.2).
-- 무엇을: analysis_projects(collecting, 씨앗 단위 재사용) + review_targets ${rows.length}행 INSERT. UPDATE·DELETE·DDL 0. 롤백: ${name}-rollback.sql
-- 거름: 게시 ${MIN_AGE_DAYS}~${MAX_AGE_DAYS}일 전 · 댓글 켜짐 · 댓글 ≥${MIN_COMMENTS}. youtube 가 enabled 가 아니면 아무것도 넣지 않는다.
BEGIN;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.review_sources WHERE key = 'youtube' AND enabled) <> 1 THEN RAISE EXCEPTION 'youtube enabled 아님 — 넣지 않는다(§10.1)'; END IF;
END $$;
CREATE TEMP TABLE _ytd (ref text NOT NULL, area text NOT NULL, label text NOT NULL, pitch text NOT NULL, url text NOT NULL) ON COMMIT DROP;
INSERT INTO _ytd (ref, area, label, pitch, url) VALUES
${vals.join(',\n')};
INSERT INTO public.analysis_projects (competitor_url, product_elevator_pitch, purpose, seller_own_guess, status, mode, business_model, area_code, area_basis, area_evidence, area_rule_ver, area_assigned_at)
SELECT DISTINCT ON (g.pitch) g.url, g.pitch, 'product_fit', NULL, 'collecting', 'forward', 'SAAS', g.area, 'label', 'label:' || g.label, 'v71ba', now()
  FROM _ytd g WHERE NOT EXISTS (SELECT 1 FROM public.analysis_projects p WHERE p.product_elevator_pitch = g.pitch) ORDER BY g.pitch, g.ref;
INSERT INTO public.review_targets (project_id, source_key, product_ref, label, cursor, status)
SELECT pj.id, 'youtube', g.ref, g.label, NULL, 'active'
  FROM _ytd g JOIN LATERAL (SELECT p.id FROM public.analysis_projects p WHERE p.product_elevator_pitch = g.pitch ORDER BY p.created_at ASC NULLS LAST, p.id LIMIT 1) pj ON true
 WHERE NOT EXISTS (SELECT 1 FROM public.review_targets t WHERE t.source_key = 'youtube' AND t.product_ref = g.ref);
COMMIT;
-- 확인: SELECT product_ref, status FROM public.review_targets WHERE source_key = 'youtube' AND product_ref IN (${rows.map((r) => q(`v:${r.id}`)).join(', ')});  -- 기대 ${rows.length}행 active
`
}

export function renderRollback(rows, name) {
  return `-- ${name}-rollback — ${name} 이 넣은 유튜브 타깃을 멈춘다(exhausted, DELETE 아님 — 수집분이 타깃을 가리킬 수 있다). 프로젝트 행은 남는다.
BEGIN;
UPDATE public.review_targets SET status = 'exhausted'
 WHERE source_key = 'youtube' AND status = 'active' AND product_ref IN (${rows.map((r) => q(`v:${r.id}`)).join(', ')});
COMMIT;
`
}

function selftest() {
  const fails = []
  const t = (n, got, want) => { if (JSON.stringify(got) !== JSON.stringify(want)) fails.push(`${n}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`) }
  const areas = { 1: { ko: ['회의록', '통화 요약'], en: ['meeting notes'] }, 2: { ko: ['영업 관리'], en: ['sales crm', 'lead management'] } }
  const qs = buildQueries(areas, { max: 4 })
  t('질의: 영역을 번갈아 섞는다', qs.map((x) => `${x.area}:${x.q}`), ['1:회의록 후기', '2:영업 관리 후기', '1:통화 요약 후기', '2:sales crm review'])
  t('질의: 영역 필터', buildQueries(areas, { only: ['2'], max: 9 }).length, 3)
  const now = new Date('2026-10-22T00:00:00Z')
  const u = new URL(searchUrl({ q: '회의록 후기', lang: 'ko' }, now))
  t('search: 기간 2~9일 전', [u.searchParams.get('publishedAfter'), u.searchParams.get('publishedBefore')], ['2026-10-13T00:00:00Z', '2026-10-20T00:00:00Z'])
  t('search: 키는 자리표시만', u.searchParams.get('key'), 'KEY')
  t('search: part=id(쿼터 최소) · 한국어는 KR', [u.searchParams.get('part'), u.searchParams.get('regionCode')], ['id', 'KR'])
  const items = [
    { id: 'AAAAAAAAAAA', snippet: { title: 'ok' }, statistics: { commentCount: '12' } },
    { id: 'BBBBBBBBBBB', snippet: { title: 'off' }, statistics: {} },
    { id: 'CCCCCCCCCCC', snippet: { title: 'few' }, statistics: { commentCount: '3' } },
    { id: 'DDDDDDDDDDD', snippet: { title: 'reg' }, statistics: { commentCount: '99' } },
    { id: 'bad id', statistics: { commentCount: '99' } },
  ]
  const p = pickVideos(items, { registered: new Set(['v:DDDDDDDDDDD']) })
  t('거름: 댓글 켜짐 ∧ ≥10 ∧ 미등록만', p.ok.map((x) => x.id), ['AAAAAAAAAAA'])
  t('거름: 사유 셈', p.skipped, { comments_off: 1, few_comments: 1, registered: 1, bad: 1 })
  const sql = renderSql([{ id: 'AAAAAAAAAAA', area: '1', seed: "it's", title: 'x', comments: 12 }], 'n')
  t('SQL: enabled 가드 · NOT EXISTS · 작은따옴표 이스케이프', [/youtube enabled 아님/.test(sql), /NOT EXISTS \(SELECT 1 FROM public\.review_targets/.test(sql), sql.includes("it''s")], [true, true, true])
  t('SQL: UPDATE·DELETE 없음', /\b(UPDATE|DELETE)\b/.test(sql.replace(/^--.*$/gm, '')), false)
  t('SQL: 0행이면 null', renderSql([], 'n'), null)
  let threw = false
  try { renderSql([{ id: "x'); DROP", area: '1', seed: 's', title: 't', comments: 1 }], 'n') } catch { threw = true }
  t('SQL: 형식 아닌 id 거부', threw, true)
  t('롤백: DELETE 아님', /DELETE/.test(renderRollback([{ id: 'AAAAAAAAAAA' }], 'n').replace(/^--.*$/gm, '')), false)
  if (fails.length) { console.error(`FAIL ${fails.length}\n  ${fails.join('\n  ')}`); process.exit(1) }
  console.log('youtube-daily-videos selftest: PASS 12')
}

async function main(argv) {
  if (argv.includes('--selftest')) return selftest()
  const opt = (n) => argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3)
  const key = process.env.YOUTUBE_API_KEY
  if (!key) { console.error('YOUTUBE_API_KEY 없음 — 확인 불가(키 없이 부르지 않는다)'); process.exit(2) }
  const now = new Date()
  const cfg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'config', 'discovery-c1.json'), 'utf8'))
  const registered = new Set(opt('registered') ? JSON.parse(fs.readFileSync(opt('registered'), 'utf8')) : [])
  if (!opt('registered')) console.log('ℹ️ --registered 없음 — 기존 타깃 거름은 SQL 의 NOT EXISTS 만 한다')
  const queries = buildQueries(cfg.areas, { only: opt('areas')?.split(',') ?? null })
  const call = async (u) => {
    const r = await fetch(u.replace('key=KEY', `key=${encodeURIComponent(key)}`), { signal: AbortSignal.timeout(20_000) })
    const body = await r.json().catch(() => null)
    if (!r.ok) throw new Error(`HTTP ${r.status} ${body?.error?.errors?.[0]?.reason ?? ''} @ ${u.split('?')[0]}`)
    return body
  }
  const byId = new Map()
  let searches = 0
  try {
    for (const qq of queries) {
      const s = await call(searchUrl(qq, now))
      searches++
      for (const it of (s?.items ?? []).slice(0, 10)) { const id = it?.id?.videoId; if (id && !byId.has(id)) byId.set(id, qq) }
    }
  } catch (e) {
    console.error(`⚠️ search 중단(${searches}/${queries.length}회 뒤) — ${e.message}. 받은 것까지만 본다(확인 불가 표시).`)
  }
  const ids = [...byId.keys()]
  const items = []
  for (let i = 0; i < ids.length; i += 50) {
    const v = await call(`${API}/videos?part=snippet,statistics&id=${ids.slice(i, i + 50).join(',')}&key=KEY`)
    items.push(...(v?.items ?? []))
  }
  const pick = pickVideos(items, { registered })
  // 질의당 PER_QUERY 개까지(댓글 많은 순) — 한 질의가 하루 몫을 독식하지 않게.
  const per = new Map()
  const rows = pick.ok.sort((a, b) => b.comments - a.comments).filter((v) => {
    const qq = byId.get(v.id)
    const n = per.get(qq.q) ?? 0
    if (n >= PER_QUERY) return false
    per.set(qq.q, n + 1)
    return true
  }).map((v) => ({ ...v, area: byId.get(v.id).area, seed: byId.get(v.id).seed }))
  console.log(`YouTube 매일 발굴: search ${searches}/${queries.length}회 · 후보 영상 ${ids.length} · 채택 ${rows.length} · 거름 ${JSON.stringify(pick.skipped)} · 예상 첫 수집 댓글 합 ${rows.reduce((s, r) => s + r.comments, 0)}`)
  for (const r of rows) console.log(`- ${r.area} v:${r.id} · ${r.comments}댓글 · ${r.title}`)
  if (argv.includes('--write') && rows.length) {
    const stamp = now.toISOString().replace(/[-:]/g, '').slice(0, 15)
    const name = `youtube-daily-${stamp}`
    const dir = path.join(repoRoot, 'reports', kstDate(now))
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, `${name}-rollback.sql`), renderRollback(rows, name))
    fs.writeFileSync(path.join(dir, `${name}.sql`), renderSql(rows, name))
    console.log(`파일: reports/${kstDate(now)}/${name}.sql (+ -rollback.sql) — ⛔ 미적용`)
  }
  process.exit(searches < queries.length ? 2 : 0)
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2)).catch((e) => { console.error(`❌ youtube-daily-videos: ${e.message}`); process.exit(1) })
}
