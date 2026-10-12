#!/usr/bin/env node
// 소비재 자료 태그 일괄 도구(남헌 v61) — **사람이 실행한다.** 무인 루프·서브에이전트는 --apply 하지 않는다(§10.1).
//
// 대상: 영역 out-consumer 프로젝트(analysis_projects.area_code)의 원문 + 유튜브 원문 전부(source_key='youtube').
//       폐기 원문(purged_at)은 뺀다. 정의 한 벌은 lib/analysis/consumer-material.ts consumerReasonOf.
// 쓰기: --apply 일 때만 consumer_material_tags 에 INSERT … ON CONFLICT DO NOTHING(멱등). UPDATE·DELETE 없음.
//       review_relevance_verdicts 는 읽기만 한다(기존 판정 덮어쓰기·삭제 없음).
//
//   node --env-file=.env.local scripts/consumer-material-tag.mjs                 # 드라이런(기본) — 건수·소스별·절감 추정·대기열 잔여
//   node --env-file=.env.local scripts/consumer-material-tag.mjs --apply         # 태그 쓰기
//   node --env-file=.env.local scripts/consumer-material-tag.mjs --boundary      # 경계 사례 목록(읽기 전용, TSV)
//   옵션: --exclude-ids=<파일>  한 줄에 input_id 하나 — 태그하지 않을 글(경계 사례 A 중 SaaS 로 남길 것).
//         없으면 파생 제외 허용 목록(config/consumer-allow-ids.txt · env RELEVANCE_CONSUMER_ALLOW_FILE)을 쓴다.
//
// 종료코드: 0 정상 · 2 설정·조회 실패(표 없음 포함 — --apply 는 마이그 20261015000010 적용 뒤에만)

import fs from 'node:fs'
import { pathToFileURL } from 'node:url'
import {
  CONSUMER_AREA, CONSUMER_RULE_VER, JUDGE_COST_PER_INPUT_USD, boundaryKindOf, consumerReasonOf, isMissingTable, loadAllowIds, parseAllowIds,
} from '../lib/analysis/consumer-material.ts'
import { DEFAULT_EXCLUDED_SOURCES } from '../lib/analysis/relevance-judge-all.ts'
import { AUTO_EXTRACT_STATUSES } from '../lib/analysis/extract-gate.ts'

/**
 * 순수 계획. 대기열 = 판정 배치가 보는 근사(상태 AUTO_EXTRACT_STATUSES · 미판정 · 제외 소스 아님 · 태그 아님).
 * ponytail: failed 재시도 상한·머리말만 있는 글은 무시한 근사(countFor 와 같은 상한 쪽 추정).
 */
export function planTags({ projects, inputs, judged, tagged, exclude = new Set(), excludedSources = DEFAULT_EXCLUDED_SOURCES }) {
  const proj = new Map(projects.map((p) => [p.id, p]))
  const inQueue = (i, tags) => {
    const p = proj.get(i.project_id)
    return !!p && AUTO_EXTRACT_STATUSES.includes(p.status) && !judged.has(i.id) && !excludedSources.includes(i.source_key ?? '(none)') && !tags.has(i.id)
  }
  const rows = []
  const bySource = {}
  const byReason = {}
  let alreadyTagged = 0
  let excludedByHuman = 0
  let withVerdict = 0
  for (const i of inputs) {
    const reason = consumerReasonOf(proj.get(i.project_id)?.area_code, i.source_key)
    if (!reason) continue
    if (tagged.has(i.id)) { alreadyTagged++; continue }
    if (exclude.has(i.id)) { excludedByHuman++; continue }
    rows.push({ input_id: i.id, project_id: i.project_id, source_key: i.source_key ?? null, reason, rule_ver: CONSUMER_RULE_VER })
    const s = (bySource[i.source_key ?? '(none)'] ??= { tags: 0, held: 0 })
    s.tags++
    if (inQueue(i, tagged)) s.held++
    byReason[reason] = (byReason[reason] ?? 0) + 1
    if (judged.has(i.id)) withVerdict++
  }
  const after = new Set([...tagged, ...rows.map((r) => r.input_id)])
  const queueBefore = inputs.filter((i) => inQueue(i, tagged)).length
  const queueAfter = inputs.filter((i) => inQueue(i, after)).length
  const held = queueBefore - queueAfter
  const consumerProjects = projects.filter((p) => p.area_code === CONSUMER_AREA)
  return {
    rows,
    stats: {
      consumerProjects: consumerProjects.length,
      marketplaceSeller: consumerProjects.filter((p) => p.business_model === 'MARKETPLACE_SELLER').length,
      newTags: rows.length, alreadyTagged, excludedByHuman, withVerdict, bySource, byReason,
      held, savingsUsd: Math.round(held * JUDGE_COST_PER_INPUT_USD * 100) / 100, queueBefore, queueAfter,
    },
  }
}

export function formatReport(stats, { apply, inserted }) {
  const src = Object.entries(stats.bySource).sort((a, b) => b[1].tags - a[1].tags).map(([k, v]) => `  - ${k}: 태그 ${v.tags} · 대기열에서 빠짐 ${v.held}`)
  return [
    `## 소비재 자료 태그 ${apply ? '(--apply)' : '(드라이런 — 쓰기 없음)'}`,
    `- 소비재 영역 프로젝트: ${stats.consumerProjects}곳(MARKETPLACE_SELLER ${stats.marketplaceSeller}곳 포함)`,
    `- 새 태그: ${stats.newTags}건(이미 태그 ${stats.alreadyTagged} · 사람 제외 ${stats.excludedByHuman}) · 그중 판정 이미 있음 ${stats.withVerdict}건(판정 행은 그대로)`,
    ...Object.entries(stats.byReason).map(([k, v]) => `  - 사유 ${k}: ${v}`),
    `- 보류(판정 대기열에서 빠지는 건수): ${stats.held}건`,
    `- 절감 추정: $${stats.savingsUsd.toFixed(2)} (= ${stats.held} × $${JUDGE_COST_PER_INPUT_USD} 출력)`,
    `- 판정 대기열 잔여: ${stats.queueBefore} → ${stats.queueAfter}건(근사 — 상태·미판정·제외 소스 기준)`,
    '- 소스별:',
    ...src,
    ...(apply ? [`- 실제로 들어간 행: ${inserted}건(나머지는 이미 있어 건너뜀)`] : ['- 쓰려면 --apply (사람이 실행)']),
  ].join('\n')
}

// ── DB 포트 ──────────────────────────────────────────────
async function supabasePort() {
  const { createClient } = await import('../lib/supabase/server.ts')
  const sb = await createClient()
  if (!sb) throw new Error('DB 연결 실패 — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 확인')
  const pages = async (build, what, { allowMissing = false } = {}) => {
    const rows = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await build().range(from, from + 999)
      if (error && allowMissing && isMissingTable(error)) return null
      if (error) throw new Error(`${what} 조회 실패: ${error.message}`)
      rows.push(...(data ?? []))
      if ((data ?? []).length < 1000) return rows
    }
  }
  return {
    loadProjects: () => pages(() => sb.from('analysis_projects').select('id, status, area_code, business_model, product_elevator_pitch').order('id'), 'analysis_projects'),
    loadInputs: () => pages(() => sb.from('analysis_inputs').select('id, project_id, source_key').is('purged_at', null).order('id'), 'analysis_inputs'),
    loadJudged: async () => new Set((await pages(() => sb.from('review_relevance_verdicts').select('input_id').order('input_id'), 'review_relevance_verdicts')).map((r) => r.input_id)),
    /** 표 없음 → null(마이그 미적용). */
    loadTagged: async () => {
      const r = await pages(() => sb.from('consumer_material_tags').select('input_id').order('input_id'), 'consumer_material_tags', { allowMissing: true })
      return r && new Set(r.map((x) => x.input_id))
    },
    async loadTexts(pids) {
      const out = []
      for (let i = 0; i < pids.length; i += 20) out.push(...(await pages(() => sb.from('analysis_inputs').select('id, project_id, source_key, raw_text').in('project_id', pids.slice(i, i + 20)).is('purged_at', null).order('id'), 'analysis_inputs(raw_text)')))
      return out
    },
    async insertTags(rows) {
      let inserted = 0
      for (let i = 0; i < rows.length; i += 500) {
        const { data, error } = await sb.from('consumer_material_tags').upsert(rows.slice(i, i + 500), { onConflict: 'input_id', ignoreDuplicates: true }).select('input_id')
        if (error) throw new Error(`태그 저장 실패(${i}번째 묶음부터, 앞 ${inserted}건은 들어갔다 — 다시 돌리면 이어서 채운다): ${error.message}`)
        inserted += (data ?? []).length
      }
      return inserted
    },
  }
}

export async function main(argv, { port, log = console.log } = {}) {
  const apply = argv.includes('--apply')
  const boundary = argv.includes('--boundary')
  const exFile = argv.find((a) => a.startsWith('--exclude-ids='))?.slice('--exclude-ids='.length)
  // 기본 = 파생 제외 허용 목록(config/consumer-allow-ids.txt) — 대기열이 풀어 준 글은 태그도 하지 않는다(한 벌).
  const exclude = exFile ? parseAllowIds(fs.readFileSync(exFile, 'utf8')) : await loadAllowIds()
  const db = port ?? (await supabasePort())
  const projects = await db.loadProjects()

  if (boundary) {
    const { loadAreasConfig } = await import('../lib/analysis/areas-config.ts')
    const areas = loadAreasConfig()
    if (!areas.cfg) throw new Error(`영역 설정 확인 불가(founder_sources): ${areas.error}`)
    const targets = projects.filter((p) => p.area_code === CONSUMER_AREA || p.business_model === 'SAAS')
    const proj = new Map(targets.map((p) => [p.id, p]))
    const texts = await db.loadTexts(targets.map((p) => p.id))
    log('kind\tinput_id\tproject_id\tsource_key\tproject\tsnippet')
    const n = { A: 0, B: 0 }
    for (const i of texts) {
      const p = proj.get(i.project_id)
      const k = p && boundaryKindOf(p, i, areas.cfg.founderSources)
      if (!k) continue
      n[k]++
      const one = (s) => String(s ?? '').replace(/\s+/g, ' ').slice(0, 80)
      log(`${k}\t${i.id}\t${i.project_id}\t${i.source_key ?? ''}\t${one(p.product_elevator_pitch).slice(0, 30)}\t${one(i.raw_text)}`)
    }
    log(`# 경계 사례 A(소비재 프로젝트 안의 SaaS 글) ${n.A}건 · B(SaaS 프로젝트 안의 소비재 글) ${n.B}건 — 낱말 휴리스틱 후보, 사람이 훑는다.`)
    log('# A 중 SaaS 로 남길 글: input_id 만 뽑아 --exclude-ids=<파일> 로 넘기면 태그하지 않는다(B 는 태그하지 않는다 — 판정이 그대로 가린다).')
    return { boundary: n }
  }

  const [inputs, judged, tagged] = await Promise.all([db.loadInputs(), db.loadJudged(), db.loadTagged()])
  if (!tagged && apply) throw new Error('consumer_material_tags 표가 없다 — 마이그 20261015000010 을 먼저 적용한다(--apply 중단, 쓴 것 없음)')
  if (!tagged) log('⚠️ consumer_material_tags 표 없음(마이그 미적용) — 이미 태그 0건으로 보고 계산한다')
  const { rows, stats } = planTags({ projects, inputs, judged, tagged: tagged ?? new Set(), exclude })
  const inserted = apply ? await db.insertTags(rows) : 0
  log(formatReport(stats, { apply, inserted }))
  return { stats, inserted }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`✗ ${e instanceof Error ? e.message : String(e)}`)
    process.exit(2)
  })
}
