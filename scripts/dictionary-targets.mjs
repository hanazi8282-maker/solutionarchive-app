#!/usr/bin/env node
// 제품 사전(reports/2026-10-05/product-dictionary/area-0N-*.json) → review_targets 투입.
//
// 남헌 v23 2(2026-10-06): 타깃 공급을 램프 엔진보다 먼저. 설계 근거는 reports/2026-10-06/design-report-v22.md §1-6·§6-4.
//
// ⚠️ 사람·역할 세션이 돌린다. 무인 루프(크론)에 배선하지 않는다(§10.1 — 설계 §1-6 "무인 루프 금지").
//    그래도 §10.1 의 무인 루프 허용 범위를 코드로 지킨다:
//      - analysis_projects: status='collecting' 신규 INSERT 만. UPDATE·DELETE 경로가 없다.
//      - review_targets: INSERT 만, 그리고 아래 소스 가드를 통과한 소스만.
//      - review_sources: 읽기만.
//
// 영역(v27): data/area-map-v26.json 의 slug → 5영역. hold·out 은 area_excluded, 맵에 없는 slug 는 area_unmapped 로
//   건너뛴다. 타깃 label 접두는 새 영역("3:klaviyo"), 영역 미배정(null)은 접두 없이 slug 만.
// 투입하는 칸 = 사전 `sources.<소스>.status === '확인'` ∧ 그 소스에 어댑터가 있다(ADAPTERS).
//   '확인 불가'·'미발견'·'검색어' 는 투입하지 않는다(3상태 원칙 — 확인 불가를 확인으로 접지 않는다).
// 소스 가드(DB review_sources 행 기준, 하나라도 걸리면 그 소스 전체를 건너뛴다):
//   - 행 없음(예: googleplay 마이그 미적용) → source_missing
//   - enabled=false → source_disabled
//   - robots_status 'allowed'·'not_applicable' 만 그대로 통과. 그 밖은 robots_unrecorded(NULL)·robots_unverified·
//     robots_disallowed 로 막는다(읽지 못한 규칙을 허용으로 보지 않는다, §7.1 — 마이그 20261005000001).
//     예외: robots_status='disallowed' ∧ isOwnerRobotsOverride(runner.ts, 허용 집합) — 러너·store 와 같은 판정.
//     소유자 예외는 robots **금지**만 통과시킨다. unverified·NULL 은 override 가 있어도 막힌다.
//   - --offline(DB 안 읽음) → source_unknown. 계획 수치만 내고 아무것도 넣지 않는다.
// product_ref 는 lib/review/target-ref.ts 빌더(= 어댑터 parseProductRef)로 정규화하고, 어댑터
//   nextRequest 가 첫 요청을 만들 수 있는지까지 본다. 못 만들면 invalid_ref — 넣으면 매일 밤 요청 0건 타깃이 된다.
// 멱등: 같은 (source_key, product_ref) 가 **어느 프로젝트에든** 이미 있으면 exists 로 건너뛴다.
//   DB UNIQUE 는 (project_id, source_key, product_ref) 라 --unit 을 바꿔 다시 돌리면 같은 앱이 두 프로젝트에서
//   두 번 수집된다 — 그래서 프로젝트를 빼고 대조한다. INSERT 의 23505 도 exists 로 센다.
//
// 투입 단위(--unit, 설계 §1-6 Q1-4):
//   product (기본) — 제품당 프로젝트 1개. 설계 권고 C안("A 를 영역 하나부터")의 단위. 영역 범위는 --areas 가 정한다.
//   area           — 영역당 프로젝트 1개, 제품은 타깃 label 로만 구분(B안).
// 프로젝트는 넣을 타깃이 1개 이상일 때만 만든다. 단 insertProject 성공 뒤 insertTarget 이 23505 아닌 오류로 던지면
//   빈 프로젝트가 남고 실행이 거기서 멈춘다(그때까지의 applied 집계는 stderr 에 찍는다). 다시 돌리면 같은 pitch 의
//   프로젝트를 재사용해 흡수한다(apply 주석).
//
// 사용법:
//   node scripts/dictionary-targets.mjs                       # 드라이런(기본) — DB 읽기만, 쓰기 0건
//   node scripts/dictionary-targets.mjs --offline             # DB 도 안 읽는다(소스 상태 = 확인 불가)
//   node scripts/dictionary-targets.mjs --run --max=100       # INSERT
//   옵션: --areas=01,07(기본) · --sources=appstore,googleplay(기본) · --unit=product|area
//         --global-us  해외(region=global) 제품에 us 타깃(appstore us:<id>, googleplay us:en:<pkg>)을 추가
//         --max=N      이번 실행 INSERT 할 타깃 상한(기본 100). 넘는 칸은 over_max 로 남는다.
//
// 카카오 `q:` 검색어(남헌 v32 §5 D5, 2026-10-07): --sources=kakao_blog,kakao_cafe --areas=07
//   사전 칸 = `sources.daum_search`(status '검색어', query) → buildProductRef(kakao_*, query) = `q:<검색어>`
//   (target-ref.ts 가 kakao_blog·kakao_cafe 를 hackernewsRef 로 받는다 — raw 는 검색어 그대로, `q:` 를 붙여 넣지 않는다).
//   영역 ⑤ 8개 중 KAKAO_FIRST_WAVE 4개만 넣는다. KAKAO_HELD 4개는 kakao_held 로 건너뛴다(남헌 결정 전 투입 금지).
//   kakao 어댑터 nextRequest 는 KAKAO_REST_API_KEY 가 없으면 던지므로, ref 검증은 어댑터 parseProductRef 로 한다(같은 규칙 한 벌).
//   소유자 예외 소스(override owner_2026-10-06)라 검색어가 늘면 캐시 범위도 는다(운영정책 20호) — 그래서 웨이브를 코드로 묶는다.
//
// 공급 게이트(남헌 v32 §5 D3·D4): 소스별 신규 상한 = lib/review/target-supply.ts gateHeadroom
//   (한 소스가 enabled 소스 활성 타깃의 30% 를 넘지 않게 · googleplay 는 활성 80 동결). 넘는 칸은 share_gate 로 건너뛴다.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { appstoreAdapter } from '../lib/review/adapters/appstore.ts'
import { googleplayAdapter } from '../lib/review/adapters/googleplay.ts'
import { buildProductRef } from '../lib/review/target-ref.ts'
import { isOwnerRobotsOverride } from '../lib/review/runner.ts'
import { kakaoBlogAdapter, kakaoCafeAdapter, parseProductRef as parseKakaoRef } from '../lib/review/adapters/kakao.ts'
import { gateHeadroom } from '../lib/review/target-supply.ts'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const DICT_DIR = path.join(repoRoot, 'reports', '2026-10-05', 'product-dictionary')
const DICT_URL = 'https://github.com/hanazi8282-maker/solutionarchive-app/blob/main/reports/2026-10-05/product-dictionary/'

/** 사전 소스 키 → 어댑터. 사전의 나머지 넷(capterra·trustradius·shopify_apps·daum_search)은 어댑터가 없다. */
export const ADAPTERS = { appstore: appstoreAdapter, googleplay: googleplayAdapter, kakao_blog: kakaoBlogAdapter, kakao_cafe: kakaoCafeAdapter }

const KAKAO = new Set(['kakao_blog', 'kakao_cafe'])
/** D5: 영역 ⑤ 검색어 8개 중 먼저 넣는 4개(설계 §1 나열 순서 앞 4개) · 보류 4개. 보류를 풀려면 남헌 결정 뒤 이 두 줄을 고친다. */
export const KAKAO_FIRST_WAVE = ['yotpo', 'judge-me', 'loox', 'okendo']
export const KAKAO_HELD = ['crema', 'alpha-review', 'vreview', 'snapreview']

/** 사전 칸 → 어댑터가 읽는 raw ref. 시장 kr 은 모든 제품, us 는 --global-us ∧ region=global 만. kakao 는 검색어 그대로(시장 없음). */
const RAW_REF = {
  appstore: (c, m) => `${m}:${c.id}`,
  googleplay: (c, m) => (m === 'kr' ? `kr:ko:${c.id}` : `us:en:${c.id}`),
  kakao_blog: (c) => String(c.query ?? ''),
  kakao_cafe: (c) => String(c.query ?? ''),
}
/** 소스 → 사전 칸·투입 상태. kakao 는 daum_search 의 '검색어' 칸. */
const cellOf = (p, source) => (KAKAO.has(source) ? p.sources?.daum_search : p.sources?.[source])
const wantStatus = (source) => (KAKAO.has(source) ? '검색어' : '확인')
/** 첫 요청을 만들 수 있는 ref 인가. kakao 는 키 없이 nextRequest 가 던지므로 같은 어댑터의 parseProductRef 로 본다. */
const refUsable = (adapter, source, ref) =>
  KAKAO.has(source)
    ? parseKakaoRef(ref) !== null
    : !!adapter.nextRequest({ id: '', projectId: '', sourceKey: source, productRef: ref, cursor: null, lastReviewAt: null })

export function loadAreas(codes, dir = DICT_DIR) {
  return codes.map((code) => {
    const file = fs.readdirSync(dir).find((f) => f.startsWith(`area-${code}-`) && f.endsWith('.json'))
    if (!file) throw new Error(`사전 파일 없음: area-${code}-*.json`)
    return { file, ...JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) }
  })
}

/**
 * v26 5영역 지도(남헌 확정 v27). slug → "1"~"5" | "hold" | "out" | null. `_` 로 시작하는 키는 메타데이터(주석·_notes).
 * 사전 JSON 은 원본 그대로 두고 영역은 이 파일 한 곳에서만 정한다. DB 행은 바꾸지 않는다.
 *   hold·out → skip='area_excluded'(신규 투입 안 함 — 기존 데이터 삭제 아님) · null → 투입하되 label 에 영역 접두 없음.
 */
export const AREA_MAP_PATH = path.join(repoRoot, 'data', 'area-map-v26.json')
export function loadAreaMap(file = AREA_MAP_PATH) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
  return Object.fromEntries(Object.entries(raw).filter(([k]) => !k.startsWith('_')))
}

function sourceGuard(row, offline) {
  if (offline) return 'source_unknown'
  if (!row) return 'source_missing'
  if (row.enabled !== true) return 'source_disabled'
  if (row.robots_status === 'allowed' || row.robots_status === 'not_applicable') return null
  if (isOwnerRobotsOverride(row.override, row.robots_status)) return null
  return row.robots_status == null ? 'robots_unrecorded' : `robots_${row.robots_status}`
}

const productPitch = (p) => `${p.name}${p.name_ko && p.name_ko !== p.name ? ` (${p.name_ko})` : ''} — ${p.summary_ko}`
const areaPitch = (a) => `제품 사전 영역 ${a.area} ${a.area_ko}`

/**
 * 순수 계획. DB 를 부르지 않는다.
 * sourceRows: key → review_sources 행(없으면 undefined) / existing: Set<`${source}|${ref}`>
 * 반환 items[] — 칸 하나(제품×소스×시장)마다 { area, slug, source, ref, label, projectKey, skip }
 */
export function plan(areas, { sources, unit, globalUs, max, sourceRows, existing, offline, areaMap = loadAreaMap(), headroom }) {
  const items = []
  const seen = new Set()
  let accepted = 0
  const perSource = {}
  for (const a of areas) {
    for (const p of a.products) {
      for (const source of sources) {
        const cell = cellOf(p, source)
        // v26 5영역(data/area-map-v26.json). 맵에 없는 slug 는 "모름"이라 넣지 않는다(§7.1 — 모르는 걸 투입으로 접지 않는다).
        const tag = Object.prototype.hasOwnProperty.call(areaMap, p.slug) ? areaMap[p.slug] : undefined
        const base = { area: a.area, slug: p.slug, source, areaTag: tag ?? null, label: tag ? `${tag}:${p.slug}` : p.slug }
        if (tag === undefined) {
          items.push({ ...base, ref: null, skip: 'area_unmapped' })
          continue
        }
        if (tag === 'hold' || tag === 'out') {
          // hold = 영역 보류(02·05), out = 신규 수집 중단(채용·이커머스 운영). 기존 타깃·데이터는 건드리지 않는다.
          items.push({ ...base, ref: null, skip: 'area_excluded' })
          continue
        }
        if (!cell || cell.status !== wantStatus(source)) {
          items.push({ ...base, ref: null, skip: `status:${cell?.status ?? '없음'}` })
          continue
        }
        const adapter = ADAPTERS[source]
        if (!adapter) {
          items.push({ ...base, ref: null, skip: 'no_adapter' })
          continue
        }
        if (KAKAO.has(source) && !KAKAO_FIRST_WAVE.includes(p.slug)) {
          items.push({ ...base, ref: null, skip: KAKAO_HELD.includes(p.slug) ? 'kakao_held' : 'kakao_not_in_wave' })
          continue
        }
        const markets = !KAKAO.has(source) && globalUs && p.region === 'global' ? ['kr', 'us'] : ['kr']
        for (const m of markets) {
          const built = buildProductRef(source, RAW_REF[source](cell, m))
          const ref = built?.ok ? built.productRef : null
          const item = {
            ...base,
            ref: ref ?? (KAKAO.has(source) ? `q:${cell.query ?? ''}` : `${m}:${cell.id}`),
            projectKey: unit === 'area' ? a.area : base.label,
            pitch: unit === 'area' ? areaPitch(a) : productPitch(p),
            competitorUrl: unit === 'area' ? DICT_URL + a.file : (p.official_url ?? cell.url),
          }
          const guard = sourceGuard(sourceRows?.[source], offline)
          if (!ref || !refUsable(adapter, source, ref)) item.skip = 'invalid_ref'
          else if (guard) item.skip = guard
          else if (existing?.has(`${source}|${ref}`)) item.skip = 'exists'
          else if (seen.has(`${source}|${ref}`)) item.skip = 'dup_in_plan'
          else if (headroom && (perSource[source] ?? 0) >= (headroom[source] ?? 0)) item.skip = 'share_gate'
          else if (accepted >= max) item.skip = 'over_max'
          else {
            accepted++
            perSource[source] = (perSource[source] ?? 0) + 1
          }
          if (ref) seen.add(`${source}|${ref}`)
          items.push(item)
        }
      }
    }
  }
  return items
}

/** 영역×소스 집계 + 한 줄 요약. */
export function summarize(items, meta) {
  const by = {}
  for (const it of items) {
    const s = ((by[it.area] ??= {})[it.source] ??= { insert: 0, skipped: {} })
    if (it.skip) s.skipped[it.skip] = (s.skipped[it.skip] ?? 0) + 1
    else s.insert++
  }
  const insert = items.filter((i) => !i.skip).length
  const projects = new Set(items.filter((i) => !i.skip).map((i) => i.projectKey)).size
  const line =
    `${meta.run ? 'RUN' : 'DRY'} unit=${meta.unit} areas=${meta.areas.join(',')} sources=${meta.sources.join(',')}` +
    ` global_us=${meta.globalUs} — 투입 ${insert}건 / 프로젝트 ${projects}개 / 건너뜀 ${items.length - insert}건`
  return { by, insert, projects, line }
}

/**
 * 실제 쓰기. db 포트(가짜로 바꿀 수 있다):
 *   findProjectsByPitch(pitches) → Map<pitch, id> · insertProject(row) → id · insertTarget(row) → 'inserted'|'exists'
 * 같은 pitch 의 기존 프로젝트가 있으면 거기에 붙인다(지난 실행에서 프로젝트만 생기고 타깃이 실패한 경우를 흡수).
 * ponytail: 프로젝트 재사용 키가 pitch 문자열이라 사람이 pitch 를 고치면 다음 실행에서 새 프로젝트를 만든다 —
 *   다만 그 제품의 타깃은 (source, ref) 대조로 이미 exists 라 빈 프로젝트는 안 생긴다. analysis_projects.area 가 생기면 그 키로.
 */
export async function apply(items, db) {
  const todo = items.filter((i) => !i.skip)
  const pitches = [...new Set(todo.map((i) => i.pitch))]
  const ids = await db.findProjectsByPitch(pitches)
  const result = { projectsCreated: 0, projectsReused: 0, inserted: 0, exists: 0 }
  const reused = new Set()
  let done = false
  try {
    for (const it of todo) {
      let id = ids.get(it.pitch)
      if (!id) {
        id = await db.insertProject({
          competitor_url: it.competitorUrl,
          product_elevator_pitch: it.pitch,
          purpose: 'product_fit',
          status: 'collecting', // §10.1: collecting 신규 INSERT 만
          mode: 'forward',
          business_model: 'SAAS',
        })
        ids.set(it.pitch, id)
        reused.add(it.pitch)
        result.projectsCreated++
      } else if (!reused.has(it.pitch)) {
        reused.add(it.pitch)
        result.projectsReused++
      }
      const r = await db.insertTarget({
        project_id: id,
        source_key: it.source,
        product_ref: it.ref,
        label: it.label,
        status: 'active',
        cursor: null,
      })
      result[r]++
    }
    done = true
  } finally {
    // 중간에 던지면(23505 아닌 오류) 이미 쓴 것을 알아야 되돌리기·재실행 판단이 된다.
    if (!done) console.error(`⚠️ 투입 중단 — 그때까지 실제 ${JSON.stringify(result)}`)
  }
  return result
}

// ── Supabase 포트 (오케스트레이터가 --run/드라이런에서만 연다) ────────────
async function supabasePort() {
  const { createClient } = await import('../lib/supabase/server.ts')
  const sb = await createClient()
  if (!sb) throw new Error('DB 연결 실패 — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 확인')
  const must = (r, what) => {
    if (r.error) throw new Error(`${what} 실패: ${r.error.message}`)
    return r.data
  }
  return {
    async loadSources(keys) {
      const rows = must(await sb.from('review_sources').select('key, enabled, robots_status, override').in('key', keys), 'review_sources 조회')
      return Object.fromEntries(rows.map((r) => [r.key, r]))
    },
    /** 30% 게이트 입력: enabled 소스별 활성 타깃 수. */
    async loadActiveCounts() {
      const on = new Set(must(await sb.from('review_sources').select('key').eq('enabled', true), 'review_sources(enabled) 조회').map((r) => r.key))
      const by = {}
      for (let from = 0; ; from += 1000) {
        const rows = must(
          await sb.from('review_targets').select('source_key').eq('status', 'active').order('id').range(from, from + 999),
          'review_targets(active) 조회',
        )
        for (const r of rows) if (on.has(r.source_key)) by[r.source_key] = (by[r.source_key] ?? 0) + 1
        if (rows.length < 1000) return by
      }
    },
    async loadExisting(keys) {
      const out = new Set()
      for (let from = 0; ; from += 1000) {
        const rows = must(
          await sb.from('review_targets').select('source_key, product_ref').in('source_key', keys).order('id').range(from, from + 999),
          'review_targets 조회',
        )
        for (const r of rows) out.add(`${r.source_key}|${r.product_ref}`)
        if (rows.length < 1000) return out
      }
    },
    async findProjectsByPitch(pitches) {
      const m = new Map()
      // 한글 pitch 는 URL 인코딩 후 길다 — 50개 묶음은 GET 쿼리스트링이 길어 fetch failed(2026-10-05 실측). 5개씩.
      for (let i = 0; i < pitches.length; i += 5) {
        const rows = must(
          await sb.from('analysis_projects').select('id, product_elevator_pitch').in('product_elevator_pitch', pitches.slice(i, i + 5)),
          'analysis_projects 조회',
        )
        for (const r of rows) if (!m.has(r.product_elevator_pitch)) m.set(r.product_elevator_pitch, r.id)
      }
      return m
    },
    async insertProject(row) {
      return must(await sb.from('analysis_projects').insert(row).select('id').single(), '프로젝트 생성').id
    },
    async insertTarget(row) {
      const r = await sb.from('review_targets').insert(row)
      if (r.error?.code === '23505') return 'exists'
      must(r, `타깃 등록(${row.source_key} ${row.product_ref})`)
      return 'inserted'
    },
  }
}

export async function main(argv, { port } = {}) {
  const arg = (name, dflt) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? dflt
  const list = (s) => s.split(',').map((x) => x.trim()).filter(Boolean)
  const meta = {
    run: argv.includes('--run'),
    offline: argv.includes('--offline'),
    globalUs: argv.includes('--global-us'),
    unit: arg('unit', 'product'),
    areas: list(arg('areas', '01,07')),
    sources: list(arg('sources', 'appstore,googleplay')),
    max: Number(arg('max', '100')),
  }
  if (!['product', 'area'].includes(meta.unit)) throw new Error(`--unit 은 product|area: ${meta.unit}`)
  if (!Number.isInteger(meta.max) || meta.max < 0) throw new Error(`--max 는 0 이상 정수: ${arg('max')}`)
  if (meta.run && meta.offline) throw new Error('--run 과 --offline 은 같이 쓸 수 없다')

  const areas = loadAreas(meta.areas)
  // --offline 은 DB 모듈을 import 조차 하지 않는다(discovery-run --dry 와 같은 이유: 샐 곳을 없앤다).
  const db = meta.offline ? null : (port ?? (await supabasePort()))
  const sourceRows = db ? await db.loadSources(meta.sources) : null
  const existing = db ? await db.loadExisting(meta.sources) : null
  // 공급 게이트(D3·D4). 못 읽으면 던진다 — 게이트 없이 넣지 않는다(§7.1).
  let headroom = null
  if (db) {
    if (typeof db.loadActiveCounts !== 'function') throw new Error('DB 포트에 loadActiveCounts 없음 — 공급 게이트를 못 읽어 투입하지 않는다')
    const active = await db.loadActiveCounts()
    const total = Object.values(active).reduce((a, b) => a + b, 0)
    headroom = Object.fromEntries(meta.sources.map((s) => [s, gateHeadroom(s, active[s] ?? 0, total)]))
  }
  const items = plan(areas, { ...meta, sourceRows, existing, headroom })
  const s = summarize(items, meta)
  const applied = meta.run ? await apply(items, db) : null
  const out = { ...meta, headroom, by: s.by, insert: s.insert, projects: s.projects, applied, items }
  return { out, line: applied ? `${s.line} → 실제 ${JSON.stringify(applied)}` : s.line }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2))
    .then(({ out, line }) => {
      console.log(JSON.stringify(out, null, 2))
      console.log(line)
    })
    .catch((e) => {
      console.error(`❌ ${e.message}`)
      process.exit(1)
    })
}
