#!/usr/bin/env node
// v71ba P0-1 — origin='mention' 으로 들어간 새 출시 입력 18행 소급 검증 + NULL 칸 채우기 → 마이그레이션 초안. DB 에 쓰지 않는다.
//   node scripts/new-release-backfill.mjs --input=<mention-input.json> [--lookup] [--run] [--date=YYYY-MM-DD] [--out-dir=supabase/migrations]
//   --input  mention-input-fetch.mjs 결과(SELECT 만). 대상 행 = 그 discovery 중 origin='mention' ∧ mention_count NULL(언급 대장 행은 언제나 채운다).
//            같은 파일의 글(언급 루프와 같은 풀)로 리뷰 속 실제 언급을 세어 mention_count·post_count·source_count·alt_seek_posts·
//            evidence_input_ids(·area_fit, 글이 있을 때만)를 채운다.
//   --lookup 앱스토어 ID 를 iTunes /lookup(D-45 허용, robots 먼저·3초 간격·차단 즉시 중단)으로 이름 대조. 안 하면 앱스토어 행은 unverified.
//   --run    마이그레이션 초안 + 롤백 파일을 쓴다(기본은 드라이런 — 계획만 출력). 적용은 오케스트레이터(§10.2). 선행: 20261022000010.
// 판정: anchored(앱 ID 가 이름과 맞음 → 등록 후보) · ambiguous(ID 는 있으나 이름과 못 묶음 → 후보 기록만) · unverified(확인 못 함 → 후보 기록만).
// 종료 코드: 0 · 1(입력 실패)
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { dominantArea, extractMentions, isAltSeek } from '../lib/discovery/mention-loop.ts'
import { verifyAnchor } from '../lib/review/anchor.ts'
import { normKey } from './product-name-candidates.mjs'
import { liveLookups, unwrap } from './mention-loop.mjs'

export const TAG = 'v71ba 소급'
const q = (v) => (v == null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`)

/** 소급 대상 — 언급 대장이 아닌데 origin='mention' 으로 들어간 행. */
export const isTarget = (r) => r.origin === 'mention' && r.mention_count == null

/** "Klaviyo: Email Marketing & SMS" → "Klaviyo" · "Voice Recorder - Audio Record" → "Voice Recorder". 구분자 없으면 그대로. */
export const baseName = (n) => String(n).split(/\s*[:|(]\s*|\s+[-–—‑]\s+|\s*‑\s*/)[0].trim()

/** 앵커 판정(순수). lookups = 앱 ID → iTunes lookup results. */
export function classify(row, lookups = new Map()) {
  const ref = String(row.probe_ref ?? '')
  if (row.probe_source_key === 'appstore') {
    const id = ref.split(':')[1]
    if (!id) return { state: 'unverified', why: '앱스토어 ID 없음' }
    if (!lookups.has(id)) return { state: 'unverified', why: `앱 ${id} lookup 안 함` }
    const v = verifyAnchor(row.name, lookups.get(id))
    return v.state === 'anchored' ? { state: 'anchored', why: `앱 ${id} lookup 이름 일치·평가 ${v.ratingCount}` } : { state: 'ambiguous', why: `앱 ${id} lookup ${v.state}: ${v.reason}` }
  }
  if (row.probe_source_key === 'shopify_apps') {
    const handle = normKey(ref.replace(/^app:/, ''))
    const brand = normKey(baseName(row.name))
    const first = normKey(String(row.name).split(/\s+/)[0])
    // ponytail: 핸들↔이름 문자열 대조만. Shopify 앱 페이지를 열어 확인하는 경로는 없다(평점도 미확인) — 핸들이 이름과 따로 노는 앱(Gorgias=helpdesk)은 ambiguous 로 남는다
    const hit = handle.length >= 4 && ((brand.length >= 4 && (handle.includes(brand) || brand.includes(handle))) || (first.length >= 4 && handle.startsWith(first)))
    return hit ? { state: 'anchored', why: `Shopify 핸들 ${ref} ↔ 이름 일치` } : { state: 'ambiguous', why: `Shopify 핸들 ${ref} ↔ 이름 "${baseName(row.name)}" 불일치` }
  }
  return { state: 'unverified', why: `검증 경로 없음(${row.probe_source_key ?? '소스 없음'})` }
}

/** 리뷰 속 실제 언급 집계(순수). 언급 루프와 같은 추출기 — 등록·자기 이름 제외 없이 원래 그대로 센다. */
export function countMentions(name, posts) {
  const keys = new Set([normKey(name), normKey(baseName(name))].filter((k) => k.length >= 3))
  let mentions = 0
  let alt = 0
  const ids = []
  const sources = new Set()
  const areas = {}
  for (const p of posts) {
    const n = extractMentions(p.raw_text).filter((m) => keys.has(m.key)).length
    if (!n) continue
    mentions += n
    ids.push(p.id)
    if (p.source_key) sources.add(p.source_key)
    const a = p.area_code ?? 'unmapped'
    areas[a] = (areas[a] ?? 0) + 1
    if (isAltSeek(p.raw_text)) alt++
  }
  const fit = ids.length ? dominantArea(areas).fit : null
  return { mention_count: mentions, post_count: ids.length, source_count: sources.size, alt_seek_posts: alt, evidence_input_ids: ids.sort().slice(0, 10), area_fit: fit == null ? null : Math.round(fit * 1000) / 1000 }
}

export function plan(discovery, posts, lookups = new Map()) {
  return discovery.filter(isTarget).map((r) => {
    const a = classify(r, lookups)
    const tail = `${TAG}: ${a.state}(${a.why}) → ${a.state === 'anchored' ? '등록 후보' : '후보 기록만'}`
    return { id: r.id, name: r.name, before: r.verdict_reason ?? null, verdict_reason: r.verdict_reason ? `${r.verdict_reason} · ${tail}` : tail, anchor: a, counts: countMentions(r.name, posts) }
  })
}

const GUARD = "origin = 'mention' AND mention_count IS NULL AND human_review = 'pending'"

export function renderMigration(p, file, { postsN }) {
  const sets = (x) => {
    const c = x.counts
    const s = [`origin = 'new_release'`, `verdict_reason = ${q(x.verdict_reason)}`, `mention_count = ${c.mention_count}`, `post_count = ${c.post_count}`, `source_count = ${c.source_count}`, `alt_seek_posts = ${c.alt_seek_posts}`, `evidence_input_ids = ARRAY[${c.evidence_input_ids.map(q).join(', ')}]::uuid[]`]
    if (c.area_fit != null) s.push(`area_fit = ${c.area_fit}`)
    return s.join(', ')
  }
  const n = (s) => p.filter((x) => x.anchor.state === s).length
  return [
    `-- ${file} — v71ba P0-1 새 출시 입력 ${p.length}행 소급 (scripts/new-release-backfill.mjs 가 만든 초안)`,
    "-- 무엇: origin='mention' ∧ mention_count NULL 행(언급 대장이 아닌 새 출시 입력)을 origin='new_release' 로 가르고, 앵커 판정을 verdict_reason 끝에 붙이고, 집계 칸을 채운다.",
    `-- 집계 출처: mention-input 글 ${postsN}개(언급 루프와 같은 풀·같은 추출기). 언급 0 이면 0 으로 채운다(측정값).`,
    `-- 앵커: anchored ${n('anchored')} · ambiguous ${n('ambiguous')} · unverified ${n('unverified')}. verdict 는 바꾸지 않는다(채택은 등록 게이트·사람 몫).`,
    '-- 선행: 20261022000010_discovery_candidates_origin_new_release.sql (없으면 CHECK 23514 로 전체가 롤백된다 — 부분 적용 없음).',
    `-- 🟡 UPDATE ${p.length}행 — §10.2 예외 2 점검: 행을 지우지 않고, id 로 한 행씩·조건(mention·집계 NULL·pending)으로 좁고, 롤백이 원래 값을 그대로 되돌린다. 대상 수가 다르면 예외로 멈춘다.`,
    '-- ⚠️ 미적용 초안 — 적용은 오케스트레이터(§10.2).',
    `-- 롤백: ${file.replace(/\.sql$/, '_rollback.sql')}`,
    '',
    'BEGIN;',
    '',
    'DO $$',
    'DECLARE n int;',
    'BEGIN',
    `  SELECT count(*) INTO n FROM public.discovery_candidates WHERE ${GUARD} AND id IN (${p.map((x) => q(x.id)).join(', ')});`,
    `  IF n <> ${p.length} THEN RAISE EXCEPTION '대상 행 % ≠ 기대 ${p.length} — 소급 중단(이미 적용됐거나 행이 바뀜)', n; END IF;`,
    'END $$;',
    '',
    ...p.map((x) => `UPDATE public.discovery_candidates SET ${sets(x)}\n WHERE id = ${q(x.id)} AND ${GUARD};`),
    '',
    'COMMIT;',
    '',
    `-- 확인: SELECT count(*) FROM public.discovery_candidates WHERE origin = 'mention' AND mention_count IS NULL;  -- 기대 0`,
    `--       SELECT count(*) FROM public.discovery_candidates WHERE origin = 'new_release' AND verdict_reason LIKE '%${TAG}%';  -- 기대 ${p.length}`,
    '',
  ].join('\n')
}

export function renderRollback(p, file) {
  return [
    `-- ${file} 롤백 — 소급 전 값으로 되돌린다(origin='mention' · verdict_reason 원문 · 집계 칸 NULL). 삭제 없음. 멱등.`,
    'BEGIN;',
    ...p.map((x) => `UPDATE public.discovery_candidates SET origin = 'mention', verdict_reason = ${q(x.before)}, mention_count = NULL, post_count = NULL, source_count = NULL, alt_seek_posts = NULL, evidence_input_ids = NULL, area_fit = NULL\n WHERE id = ${q(x.id)} AND origin = 'new_release' AND verdict_reason LIKE '%${TAG}%';`),
    'COMMIT;',
    '',
  ].join('\n')
}

export async function main(argv, { log = console.log, fetchFn = fetch } = {}) {
  const opt = (n) => argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3)
  if (!opt('input')) throw new Error('--input=<mention-input.json> 필요(대상 행·글 모두 여기서 읽는다)')
  const input = unwrap(JSON.parse(fs.readFileSync(opt('input'), 'utf8')))
  const targets = input.discovery.filter(isTarget)
  if (input.discovery.length && !('origin' in input.discovery[0])) throw new Error('입력 discovery 에 origin·mention_count 칸이 없다 — mention-input-fetch.mjs 최신판으로 다시 뽑는다(못 읽은 것을 0행으로 접지 않는다)')
  if (targets.some((r) => !r.id)) throw new Error('대상 행에 id 가 없다')
  let lookups = new Map()
  if (argv.includes('--lookup')) {
    const ids = targets.filter((r) => r.probe_source_key === 'appstore').map((r) => String(r.probe_ref).split(':')[1]).filter(Boolean)
    if (ids.length) ({ out: lookups } = await liveLookups(ids, { fetchFn, log }))
  }
  const p = plan(input.discovery, input.posts, lookups)
  const by = (s) => p.filter((x) => x.anchor.state === s).length
  log(`[새 출시 소급] ${argv.includes('--run') ? '초안 쓰기' : '드라이런'} · 대상(origin=mention ∧ 집계 NULL) ${p.length} · anchored ${by('anchored')} · ambiguous ${by('ambiguous')} · unverified ${by('unverified')} · 글 ${input.posts.length}개 중 언급 있는 행 ${p.filter((x) => x.counts.post_count).length}`)
  for (const x of p) log(`  - ${x.name} · ${x.anchor.state} · ${x.anchor.why} · 언급 ${x.counts.mention_count}회/${x.counts.post_count}글`)
  if (!argv.includes('--run') || !p.length) return p
  const date = (opt('date') ?? new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)).replace(/-/g, '')
  const file = `${date}000020_new_release_backfill_v71ba.sql`
  const dir = opt('out-dir') ?? 'supabase/migrations'
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, file), renderMigration(p, file, { postsN: input.posts.length }))
  fs.writeFileSync(path.join(dir, file.replace(/\.sql$/, '_rollback.sql')), renderRollback(p, file))
  log(`  파일: ${path.join(dir, file)} (+ _rollback.sql)`)
  return p
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`❌ new-release-backfill: ${e.message}`)
    process.exit(1)
  })
}
