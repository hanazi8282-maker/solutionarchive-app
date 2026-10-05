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
// 투입하는 칸 = 사전 `sources.<소스>.status === '확인'` ∧ 그 소스에 어댑터가 있다(ADAPTERS).
//   '확인 불가'·'미발견'·'검색어' 는 투입하지 않는다(3상태 원칙 — 확인 불가를 확인으로 접지 않는다).
// 소스 가드(DB review_sources 행 기준, 하나라도 걸리면 그 소스 전체를 건너뛴다):
//   - 행 없음(예: googleplay 마이그 미적용) → source_missing
//   - enabled=false → source_disabled
//   - robots_status 'allowed'·'not_applicable' 만 그대로 통과. 그 밖은 robots_unrecorded(NULL)·robots_unverified·
//     robots_disallowed 로 막는다(읽지 못한 규칙을 허용으로 보지 않는다, §7.1 — 마이그 20261005000001).
//     예외: robots_status='disallowed' ∧ override === OWNER_ROBOTS_OVERRIDE(runner.ts) — 러너·store 와 같은 판정.
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

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { appstoreAdapter } from '../lib/review/adapters/appstore.ts'
import { googleplayAdapter } from '../lib/review/adapters/googleplay.ts'
import { buildProductRef } from '../lib/review/target-ref.ts'
import { OWNER_ROBOTS_OVERRIDE } from '../lib/review/runner.ts'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const DICT_DIR = path.join(repoRoot, 'reports', '2026-10-05', 'product-dictionary')
const DICT_URL = 'https://github.com/hanazi8282-maker/solutionarchive-app/blob/main/reports/2026-10-05/product-dictionary/'

/** 사전 소스 키 → 어댑터. 사전의 나머지 넷(capterra·trustradius·shopify_apps·daum_search)은 어댑터가 없다. */
export const ADAPTERS = { appstore: appstoreAdapter, googleplay: googleplayAdapter }

/** 사전 칸 → 어댑터가 읽는 raw ref. 시장 kr 은 모든 제품, us 는 --global-us ∧ region=global 만. */
const RAW_REF = {
  appstore: (id, m) => `${m}:${id}`,
  googleplay: (id, m) => (m === 'kr' ? `kr:ko:${id}` : `us:en:${id}`),
}

export function loadAreas(codes, dir = DICT_DIR) {
  return codes.map((code) => {
    const file = fs.readdirSync(dir).find((f) => f.startsWith(`area-${code}-`) && f.endsWith('.json'))
    if (!file) throw new Error(`사전 파일 없음: area-${code}-*.json`)
    return { file, ...JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) }
  })
}

function sourceGuard(row, offline) {
  if (offline) return 'source_unknown'
  if (!row) return 'source_missing'
  if (row.enabled !== true) return 'source_disabled'
  if (row.robots_status === 'allowed' || row.robots_status === 'not_applicable') return null
  if (row.robots_status === 'disallowed' && row.override === OWNER_ROBOTS_OVERRIDE) return null
  return row.robots_status == null ? 'robots_unrecorded' : `robots_${row.robots_status}`
}

const productPitch = (p) => `${p.name}${p.name_ko && p.name_ko !== p.name ? ` (${p.name_ko})` : ''} — ${p.summary_ko}`
const areaPitch = (a) => `제품 사전 영역 ${a.area} ${a.area_ko}`

/**
 * 순수 계획. DB 를 부르지 않는다.
 * sourceRows: key → review_sources 행(없으면 undefined) / existing: Set<`${source}|${ref}`>
 * 반환 items[] — 칸 하나(제품×소스×시장)마다 { area, slug, source, ref, label, projectKey, skip }
 */
export function plan(areas, { sources, unit, globalUs, max, sourceRows, existing, offline }) {
  const items = []
  const seen = new Set()
  let accepted = 0
  for (const a of areas) {
    for (const p of a.products) {
      for (const source of sources) {
        const cell = p.sources?.[source]
        const base = { area: a.area, slug: p.slug, source, label: `${a.area}:${p.slug}` }
        if (!cell || cell.status !== '확인') {
          items.push({ ...base, ref: null, skip: `status:${cell?.status ?? '없음'}` })
          continue
        }
        const adapter = ADAPTERS[source]
        if (!adapter) {
          items.push({ ...base, ref: null, skip: 'no_adapter' })
          continue
        }
        const markets = globalUs && p.region === 'global' ? ['kr', 'us'] : ['kr']
        for (const m of markets) {
          const built = buildProductRef(source, RAW_REF[source](String(cell.id ?? ''), m))
          const ref = built?.ok ? built.productRef : null
          const item = {
            ...base,
            ref: ref ?? `${m}:${cell.id}`,
            projectKey: unit === 'area' ? a.area : base.label,
            pitch: unit === 'area' ? areaPitch(a) : productPitch(p),
            competitorUrl: unit === 'area' ? DICT_URL + a.file : (p.official_url ?? cell.url),
          }
          const guard = sourceGuard(sourceRows?.[source], offline)
          if (!ref || !adapter.nextRequest({ id: '', projectId: '', sourceKey: source, productRef: ref, cursor: null, lastReviewAt: null })) item.skip = 'invalid_ref'
          else if (guard) item.skip = guard
          else if (existing?.has(`${source}|${ref}`)) item.skip = 'exists'
          else if (seen.has(`${source}|${ref}`)) item.skip = 'dup_in_plan'
          else if (accepted >= max) item.skip = 'over_max'
          else accepted++
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
      for (let i = 0; i < pitches.length; i += 50) {
        const rows = must(
          await sb.from('analysis_projects').select('id, product_elevator_pitch').in('product_elevator_pitch', pitches.slice(i, i + 50)),
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
  const items = plan(areas, { ...meta, sourceRows, existing })
  const s = summarize(items, meta)
  const applied = meta.run ? await apply(items, db) : null
  const out = { ...meta, by: s.by, insert: s.insert, projects: s.projects, applied, items }
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
