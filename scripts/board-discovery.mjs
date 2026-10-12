#!/usr/bin/env node
// 자율 발굴 C-1 ①(남헌 v56 §C-1 · v61) — 하위 게시판 목록 발굴. 오케스트레이터는 scripts/discovery-c1.mjs.
//
// 순서(소스마다): 게이트(enabled · 공급 제외 아님 · 약관 금지 아님) → 디렉터리 robots(쿼리 포함, 확인 불가는 안 감)
//   → 디렉터리 1장 GET → slug 추출 → 이미 있는 타깃·제외·지난 대장·어댑터 미지원 거르기(소스당 하루 후보 5 = DISCOVERY_TARGET_MAX)
//   → 후보마다 목록 1페이지 robots + GET → 어댑터 parse 로 새 글 큐 ≥1 ∧ 파싱 실패 0 이면 채택.
//   403·429·빈 본문·캡차 1건이면 전체 즉시 중단(우회 없음). 요청 간격 = max(min_interval_ms, 3000).
//
// 쓰기: DB 0. --write 일 때만 파일 —
//   reports/<KST>/board-targets-<stamp>.sql(+ -rollback.sql)  채택 게시판 INSERT 초안(⛔ 미적용, 적용은 오케스트레이터 §10.2)
//   reports/<KST>/board-demote-<stamp>.sql(+ -rollback.sql)   등재 3일 뒤 신규 0 강등 UPDATE 초안(⛔ 미적용)
//   reports/board-discovery.json                               대장(proposed | closed=타깃이 active 아님(강등 적용 등) | suggested=어댑터 미지원)
// 이 경로는 review_targets 에 직접 쓰지 않는다 — §10.1 의 무인 등재 허용은 창문 경로(v53)에만 있다. 넓히려면 남헌 결정.

import fs from 'node:fs'
import path from 'node:path'

import { cook82Adapter } from '../lib/review/adapters/82cook.ts'
import { bobaedreamAdapter } from '../lib/review/adapters/bobaedream.ts'
import { clienAdapter } from '../lib/review/adapters/clien.ts'
import { okkyAdapter } from '../lib/review/adapters/okky.ts'
import { TOS_BLOCKING } from '../lib/discovery/store-search.ts'
import { isStrictBlock } from '../lib/review/runner.ts'
import { DISCOVERY_TARGET_MAX, SUPPLY_EXCLUDED } from '../lib/review/target-supply.ts'
import { decodeBoardCursor } from '../lib/review/types.ts'
import { robotsFor } from './store-search-discovery.mjs'
import { demotionRollbackSql, planDemotion } from './window-discovery.mjs'

export const BOARD_ADAPTERS = { '82cook': cook82Adapter, bobaedream: bobaedreamAdapter, clien: clienAdapter, okky: okkyAdapter }
export const LEDGER = 'board-discovery.json'
export const MIN_INTERVAL_MS = 3000
const BOARD_REF = /^board:[A-Za-z0-9_-]{1,40}$/
const q = (s) => `'${String(s).replace(/'/g, "''")}'`

// ── 순수 ─────────────────────────────────────────────

/** 디렉터리 HTML → slug(첫 등장 순, 중복 제거). pattern 은 캡처 그룹 1개. */
export function extractSlugs(html, pattern) {
  const out = []
  for (const m of String(html).matchAll(new RegExp(pattern, 'g'))) if (m[1] && !out.includes(m[1])) out.push(m[1])
  return out
}

/** 소스를 오늘 볼 수 있나. 막히면 사유 문자열, 열리면 null. 약관 null 은 막지 않는다(그 소스는 등록 때 법적 점검을 거쳤다 — §10.1). */
export function boardGate(src) {
  if (!src) return 'review_sources 행 없음'
  if (src.enabled !== true) return 'enabled 아님'
  if (SUPPLY_EXCLUDED.has(src.key)) return '공급 제외 소스'
  if (TOS_BLOCKING.has(src.tos_status)) return `약관 금지(tos_status=${src.tos_status}) — 제안만`
  return null
}

/** 새 slug → 오늘 실측할 것(probe) · 제안만(suggest) · 건너뜀 사유 수. probe+suggest 합이 소스당 cap. */
export function pickCandidates(slugs, { sourceKey, adapter, existingRefs, ledgerKeys, exclude = [], include = null, cap = DISCOVERY_TARGET_MAX }) {
  const probe = []
  const suggest = []
  const skipped = {}
  const skip = (r) => (skipped[r] = (skipped[r] ?? 0) + 1)
  for (const slug of slugs) {
    const ref = `board:${slug}`
    if (existingRefs.has(ref)) { skip('existing'); continue }
    if (exclude.includes(slug)) { skip('excluded'); continue }
    if (include?.length && !include.includes(slug)) { skip('not_included'); continue }
    if (ledgerKeys.has(`${sourceKey}|${ref}`)) { skip('seen_before'); continue }
    if (!BOARD_REF.test(ref)) { skip('bad_slug'); continue }
    if (probe.length + suggest.length >= cap) { skip('daily_cap'); continue }
    const req = adapter?.nextRequest({ id: 'probe', projectId: 'probe', sourceKey, productRef: ref, cursor: null, lastReviewAt: null, consecutiveEmpty: 0 })
    if (!req) suggest.push({ slug, ref, reason: 'adapter_unsupported' })
    else probe.push({ slug, ref, url: req.url })
  }
  return { probe, suggest, skipped }
}

/** 목록 1페이지 응답 판정. 채택 = 어댑터가 새 글 큐를 1개 이상 냈고 파싱 실패 0. 0건과 못 읽음을 가른다(§7.1). */
export function judgeList(res, adapter, ref) {
  if (res.status !== 200) return { verdict: 'unverified', why: `HTTP ${res.status ?? res.error}` }
  let p
  try {
    p = adapter.parse(res.body, { productRef: ref, cursor: null, lastReviewAt: null })
  } catch (e) {
    return { verdict: 'unverified', why: `parse 예외: ${e.message}` }
  }
  if (p.parseFailures > 0) return { verdict: 'unverified', why: `parseFailures ${p.parseFailures}` }
  const posts = decodeBoardCursor(p.nextCursor).q.length
  return posts > 0 ? { verdict: 'adopted', posts } : { verdict: 'empty', posts: 0 }
}

const blocked = (res, adapter) => res.status === 403 || res.status === 429 || isStrictBlock(res, adapter?.isChallenge)

/**
 * 본체. 네트워크는 주입된 fetchText 만. robots.txt 는 URL 별로 한 번만 받는다.
 * 반환 { sources: {key: {status, slugs, skipped}}, adopted: [], suggested: [], requests, aborted }
 */
export async function discoverBoards({ cfg, sources, targets, ledger, fetchText, sleep, adapters = BOARD_ADAPTERS }) {
  const out = { sources: {}, adopted: [], suggested: [], requests: 0, aborted: null }
  const memo = new Map()
  const get = (url) => {
    out.requests++
    return fetchText(url)
  }
  const robotsFetch = (url) => (memo.has(url) ? memo.get(url) : (memo.set(url, get(url)), memo.get(url)))
  const ledgerKeys = new Set((ledger?.entries ?? []).map((e) => `${e.source_key}|${e.product_ref}`))
  for (const [key, b] of Object.entries(cfg.boards ?? {})) {
    const r = (out.sources[key] = { status: 'ok', slugs: 0, skipped: {} })
    if (out.aborted) { r.status = 'aborted'; continue }
    const src = sources.find((s) => s.key === key)
    const g = boardGate(src)
    if (g) { r.status = `gate: ${g}`; continue }
    const adapter = adapters[key]
    if (!adapter) { r.status = '어댑터 없음'; continue }
    const interval = Math.max(Number(src.min_interval_ms) || 0, MIN_INTERVAL_MS)
    const dirRobots = await robotsFor(b.directory, robotsFetch)
    if (dirRobots !== 'allowed') { r.status = `디렉터리 robots ${dirRobots}`; continue }
    await sleep(interval)
    const dir = await get(b.directory)
    if (blocked(dir, adapter)) { out.aborted = `blocked:${dir.status}`; r.status = 'blocked'; continue }
    if (dir.status !== 200) { r.status = `디렉터리 HTTP ${dir.status ?? dir.error}`; continue }
    const slugs = extractSlugs(dir.body, b.slug_pattern)
    r.slugs = slugs.length
    if (!slugs.length) { r.status = '디렉터리 slug 0 — 패턴 확인 필요(확인 불가)'; continue }
    const existingRefs = new Set(targets.filter((t) => t.source_key === key).map((t) => t.product_ref))
    const pick = pickCandidates(slugs, { sourceKey: key, adapter, existingRefs, ledgerKeys, exclude: b.exclude, include: b.include })
    r.skipped = pick.skipped
    for (const s of pick.suggest) out.suggested.push({ source_key: key, product_ref: s.ref, reason: s.reason })
    for (const c of pick.probe) {
      const rob = await robotsFor(c.url, robotsFetch)
      if (rob !== 'allowed') { out.suggested.push({ source_key: key, product_ref: c.ref, reason: `robots ${rob}` }); continue }
      await sleep(interval)
      const res = await get(c.url)
      if (blocked(res, adapter)) { out.aborted = `blocked:${res.status}`; r.status = 'blocked'; break }
      const j = judgeList(res, adapter, c.ref)
      if (j.verdict === 'adopted') out.adopted.push({ source_key: key, product_ref: c.ref, label: `${key} ${c.slug} 게시판 순회(자율 발굴)`, posts: j.posts })
      else out.suggested.push({ source_key: key, product_ref: c.ref, reason: j.verdict === 'empty' ? 'empty_list' : `unverified: ${j.why}` })
    }
  }
  return out
}

/** 대장의 proposed 중 타깃이 생긴 것(=적용됨) → 창문과 같은 규칙(planDemotion)으로 3일 뒤 신규 0 강등 대상. 대장에 id·등재 시각을 채운다. */
export function boardDemotion(ledger, targets, now) {
  const byKey = new Map(targets.map((t) => [`${t.source_key}|${t.product_ref}`, t]))
  const entries = []
  for (const e of ledger?.entries ?? []) {
    if (e.status !== 'proposed') continue
    const t = byKey.get(`${e.source_key}|${e.product_ref}`)
    if (!t?.id || !t.created_at) continue // 아직 미적용
    e.id = t.id
    e.registered_at = t.created_at
    // 강등 SQL 이 적용됐거나 사람이 닫은 타깃 = 종결. proposed 로 두면 매일 '확인 불가(이미 exhausted)' 소음이 된다.
    if (t.status !== 'active') {
      Object.assign(e, { status: 'closed', closed_reason: `target ${t.status}`, closed_at: now.toISOString() })
      continue
    }
    entries.push({ id: t.id, status: 'adopted', registered_at: t.created_at, baseline_total_collected: 0 })
  }
  return planDemotion(entries, targets, now)
}

function checkRows(rows) {
  for (const r of rows) {
    if (!BOARD_REF.test(r.product_ref)) throw new Error(`product_ref 형식 아님: ${r.product_ref}`)
    if (!/^[a-z0-9_]{1,40}$/.test(r.source_key)) throw new Error(`source_key 형식 아님: ${r.source_key}`)
    if (typeof r.label !== 'string' || !/^[^\\\r\n]{1,200}$/.test(r.label)) throw new Error(`label 형식 아님: ${r.label}`)
  }
}

/** 채택 게시판 INSERT 초안 — 20260930000008 과 같은 방식(소스별 기존 타깃이 가장 많은 프로젝트, uuid 하드코딩 없음). */
export function renderBoardSql(rows, name) {
  checkRows(rows)
  return `-- ${name}
-- ⛔ 미적용 초안 — scripts/board-discovery.mjs(자율 발굴 C-1 ①)가 만들었다. 적용은 오케스트레이터 판단(CLAUDE.md §10.2).
-- 무엇을: review_targets ${rows.length}행 INSERT(board: 게시판 순회). UPDATE·DELETE·DDL 0. 롤백: ${name}-rollback.sql
-- project_id = 그 소스의 기존 타깃이 가장 많은 프로젝트(동수면 uuid 순). 소스 타깃이 0이면 그 행은 0행 INSERT(조용한 끝 — 아래 확인 쿼리로 본다).
BEGIN;
WITH wanted(source_key, product_ref, label) AS (
  VALUES
${rows.map((r, i) => `    (${q(r.source_key)}, ${q(r.product_ref)}, ${q(r.label)})${i < rows.length - 1 ? ',' : ''}  -- 목록 1페이지 새 글 ${r.posts}`).join('\n')}
),
pick_project AS (
  SELECT DISTINCT ON (source_key) source_key, project_id
    FROM public.review_targets
   GROUP BY source_key, project_id
   ORDER BY source_key, count(*) DESC, project_id
)
INSERT INTO public.review_targets (project_id, source_key, product_ref, label, status)
SELECT p.project_id, w.source_key, w.product_ref, w.label, 'active'
  FROM wanted w JOIN pick_project p ON p.source_key = w.source_key
 WHERE NOT EXISTS (SELECT 1 FROM public.review_targets t WHERE t.source_key = w.source_key AND t.product_ref = w.product_ref);
COMMIT;
-- 확인: SELECT source_key, product_ref, status, cursor FROM public.review_targets WHERE (source_key, product_ref) IN (${rows.map((r) => `(${q(r.source_key)}, ${q(r.product_ref)})`).join(', ')});  -- 기대 ${rows.length}행 active
`
}

export function renderBoardRollback(rows, name) {
  checkRows(rows)
  return `-- ${name}-rollback — ${name} 이 넣은 게시판 타깃만 지운다. 수집된 analysis_inputs·review_fingerprints 는 남는다(지우려면 scripts/review-purge.mjs).
-- 지우기 전에: SELECT source_key, product_ref, total_collected FROM public.review_targets WHERE (source_key, product_ref) IN (${rows.map((r) => `(${q(r.source_key)}, ${q(r.product_ref)})`).join(', ')});
BEGIN;
DELETE FROM public.review_targets
 WHERE (source_key, product_ref) IN (${rows.map((r) => `(${q(r.source_key)}, ${q(r.product_ref)})`).join(', ')});
COMMIT;
`
}

/** 강등 UPDATE 초안 — status 한 칸, 그새 바뀐 행(active 아님·수집 생김)은 건드리지 않는다. */
export function renderDemoteSql(items, name) {
  const ids = items.map(({ target }) => {
    if (!/^[0-9a-f-]{36}$/i.test(target.id)) throw new Error(`id 형식 아님: ${target.id}`)
    return `'${target.id}'::uuid`
  })
  return `-- ${name}
-- ⛔ 미적용 초안 — 자율 발굴 C-1 ① 등재 3일 뒤 신규 0 게시판 강등(active→exhausted). 롤백: ${name}-rollback.sql
BEGIN;
UPDATE public.review_targets SET status = 'exhausted'
 WHERE id IN (${ids.join(', ')}) AND status = 'active' AND total_collected = 0;
COMMIT;
`
}

/** 보고 블록 한 줄. */
export function boardLine(r, demote) {
  const per = Object.entries(r.sources).map(([k, s]) => `${k} ${s.status}${s.slugs ? `(slug ${s.slugs})` : ''}`).join(' · ')
  return `게시판: 채택 ${r.adopted.length} · 제안만 ${r.suggested.length} · 강등 대상 ${demote?.demote.length ?? 0}(확인 불가 ${demote?.unverified.length ?? 0}) · 요청 ${r.requests}${r.aborted ? ` · ⛔중단 ${r.aborted}` : ''} — ${per || '설정된 소스 없음'}`
}

export function readLedger(reportsDir) {
  const f = path.join(reportsDir, LEDGER)
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : { _comment: '자율 발굴 C-1 ① 게시판 대장(scripts/board-discovery.mjs). proposed = 초안에 넣음 · suggested = 제안만.', entries: [] }
}

/** --write: 초안·롤백·대장. 롤백을 먼저 쓴다. 반환 = 쓴 파일 목록. */
export function writeOutputs({ result, demote, ledger, reportsDir, date, stamp, now }) {
  const files = []
  const w = (f, body) => {
    fs.mkdirSync(path.dirname(f), { recursive: true })
    fs.writeFileSync(f, body)
    if (fs.readFileSync(f, 'utf8') !== body) throw new Error(`되읽기 불일치: ${f}`)
    files.push(f.replace(/\\/g, '/'))
  }
  const day = path.join(reportsDir, date)
  if (result.adopted.length) {
    const name = `board-targets-${stamp}`
    w(path.join(day, `${name}-rollback.sql`), renderBoardRollback(result.adopted, name))
    w(path.join(day, `${name}.sql`), renderBoardSql(result.adopted, name))
  }
  if (demote.demote.length) {
    const name = `board-demote-${stamp}`
    w(path.join(day, `${name}-rollback.sql`), demotionRollbackSql(demote.demote.map(({ target }) => ({ id: target.id, prev_consecutive_empty: target.consecutive_empty })), stamp))
    w(path.join(day, `${name}.sql`), renderDemoteSql(demote.demote, name))
  }
  const at = now.toISOString()
  for (const a of result.adopted) ledger.entries.push({ source_key: a.source_key, product_ref: a.product_ref, label: a.label, posts: a.posts, status: 'proposed', at })
  // 제안만 중 다시 봐도 같은 것(어댑터 미지원)만 남긴다 — robots·HTTP·빈 목록은 일시적일 수 있어 다음 날 다시 본다.
  for (const s of result.suggested.filter((x) => x.reason === 'adapter_unsupported')) ledger.entries.push({ source_key: s.source_key, product_ref: s.product_ref, status: 'suggested', reason: s.reason, at })
  w(path.join(reportsDir, LEDGER), JSON.stringify(ledger, null, 2) + '\n')
  return files
}
