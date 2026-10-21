#!/usr/bin/env node
// 1차 미판정이 왜 남았나 — 미판정 입력을 판정 파이프라인과 **같은 규칙·같은 순서**로 사유별로 가른다(v71bb ③). **읽기 전용**(SELECT 만).
//   node --env-file=.env.local scripts/relevance-unjudged-why.mjs [--source=bobaedream,hackernews,...] [--json]
//   기본 소스 = 오케스트레이터가 10-21 에 센 미판정 상위 5곳(bobaedream·hackernews·googleplay·github_issues·clien).
// 사유(판정 대기열이 거르는 순서 그대로 — scripts/relevance-judge-auto.mjs · lib/analysis/relevance-pending.ts):
//   status:<값>        프로젝트 상태가 후보(AUTO_EXTRACT_STATUSES) 밖 — 1차가 아예 안 본다
//   failed_excluded    재추출 1회 뒤에도 failed(v28 #10) · failed_unknown = extract_attempts 확인 불가
//   consumer_tag       consumer_material_tags 표에 있다(남헌 v61)
//   consumer_derived   표엔 없지만 파생 규칙(area_code='out-consumer' 또는 youtube 소스)으로 소비재 — **SQL 로 태그 표만 빼면 이 몫이 "미판정"으로 보인다**
//   excluded_source    RELEVANCE_EXCLUDE_SOURCES(기본 youtube, 'none'=없음)
//   no_body            T1(selectInputs)이 본문 없음(빈 원문·머리말뿐)으로 거름
//   hn_low             HN 저가치 사전 제외(config/prefilter-rules.json hn_lowvalue.mode=on, env HN_PREFILTER 가 이김)
//   eligible_out_area  대기열에 있다 — 영역 밖(out-*) 프로젝트라 영역 결손 순서에서 뒤(1차는 판정, 2차는 v71p A안으로 제외)
//   eligible           대기열에 있다 — 다음 실행이 판정할 몫
// 종료코드: 0 · 2 설정/조회 실패
import { pathToFileURL } from 'node:url'
import { AUTO_EXTRACT_STATUSES, relevanceFailedState } from '../lib/analysis/extract-gate.ts'
import { consumerReasonOf, consumerSkipEnabled, loadAllowIds } from '../lib/analysis/consumer-material.ts'
import { DEFAULT_EXCLUDED_SOURCES, fetchAllPages, parseExcludedSources } from '../lib/analysis/relevance-judge-all.ts'
import { selectInputs } from '../lib/analysis/extract-select.ts'
import { isHnLowValue, loadPrefilterConfig } from '../lib/analysis/prefilter.ts'

export const DEFAULT_SOURCES = ['bobaedream', 'hackernews', 'googleplay', 'github_issues', 'clien']

/**
 * 한 프로젝트의 미판정 입력을 사유별로 센다(순수). inputs = 그 프로젝트 원문 행(purged 제외), done = 판정 있는 input_id.
 * 규칙 순서는 판정 대기열과 같다 — 앞 사유에 걸리면 뒤는 안 본다.
 */
export function classifyProject(project, inputs, { done, tagged, allow, excludedSources, skipConsumer, prefilterCfg }) {
  const out = {}
  const add = (src, k) => { const s = (out[src ??= '(none)'] ??= {}); s[k] = (s[k] ?? 0) + 1 }
  const undone = inputs.filter((r) => !done.has(r.id))
  if (!AUTO_EXTRACT_STATUSES.includes(project.status)) { for (const r of undone) add(r.source_key, `status:${project.status}`); return out }
  const fs = relevanceFailedState(project.status, project.extract_attempts)
  if (fs === 'excluded' || fs === 'unknown') { for (const r of undone) add(r.source_key, `failed_${fs}`); return out }
  const eligible = new Set(selectInputs(undone, { maxCharsTotal: Number.POSITIVE_INFINITY }).selected.map((s) => s.input.id))
  const hnOn = !!prefilterCfg && prefilterCfg.hn.mode === 'on'
  const outArea = String(project.area_code ?? '').startsWith('out-')
  for (const r of undone) {
    const src = r.source_key ?? '(none)'
    if (skipConsumer && tagged.has(r.id)) add(src, 'consumer_tag')
    else if (skipConsumer && !allow.has(r.id) && !excludedSources.includes(src) && consumerReasonOf(project.area_code, r.source_key) !== null) add(src, 'consumer_derived')
    else if (excludedSources.includes(src)) add(src, 'excluded_source')
    else if (!eligible.has(r.id)) add(src, 'no_body')
    else if (hnOn && isHnLowValue(r, prefilterCfg)) add(src, 'hn_low')
    else add(src, outArea ? 'eligible_out_area' : 'eligible')
  }
  return out
}

/** 프로젝트별 결과를 소스 × 사유로 합친다(순수). */
export function mergeCounts(perProject) {
  const tot = {}
  for (const m of perProject) for (const [src, b] of Object.entries(m)) for (const [k, n] of Object.entries(b)) { const s = (tot[src] ??= {}); s[k] = (s[k] ?? 0) + n }
  return tot
}

async function main() {
  const { createClient } = await import('../lib/supabase/server.ts')
  const sb = await createClient()
  if (!sb) { console.error('✗ DB 연결 실패'); process.exit(2) }
  const sources = (process.argv.find((a) => a.startsWith('--source='))?.slice(9) ?? '').split(',').map((s) => s.trim()).filter(Boolean)
  const want = sources.length ? sources : DEFAULT_SOURCES
  const skipConsumer = consumerSkipEnabled()
  const excludedSources = parseExcludedSources(process.env.RELEVANCE_EXCLUDE_SOURCES ?? 'none', DEFAULT_EXCLUDED_SOURCES) // 운영 리포 변수는 'none'(10-18)
  const prefilterCfg = loadPrefilterConfig().cfg
  const allow = await loadAllowIds()
  const { data: projects, error } = await sb.from('analysis_projects').select('id, status, extract_attempts, area_code, product_elevator_pitch')
  if (error) { console.error(`✗ 프로젝트 조회 실패: ${error.message}`); process.exit(2) }
  const per = []
  const top = []
  for (const p of projects) {
    const got = await fetchAllPages(() => sb.from('analysis_inputs').select('id, source_key, raw_text, created_at, collected_at').eq('project_id', p.id).in('source_key', want).is('purged_at', null).order('id'))
    if (got.error || got.truncated) { console.error(`✗ 원문 조회 실패 project=${p.id}: ${got.error?.message ?? '상한'}`); process.exit(2) }
    if (!got.data.length) continue
    const j = await fetchAllPages(() => sb.from('review_relevance_verdicts').select('input_id').eq('project_id', p.id).order('input_id'))
    const tg = await fetchAllPages(() => sb.from('consumer_material_tags').select('input_id').eq('project_id', p.id).order('input_id'))
    if (j.error || tg.error) { console.error(`✗ 판정/태그 조회 실패 project=${p.id}`); process.exit(2) }
    const m = classifyProject(p, got.data, { done: new Set(j.data.map((r) => r.input_id)), tagged: new Set(tg.data.map((r) => r.input_id)), allow, excludedSources, skipConsumer, prefilterCfg })
    per.push(m)
    const n = Object.values(m).reduce((s, b) => s + Object.values(b).reduce((a, x) => a + x, 0), 0)
    if (n) top.push({ id: p.id, status: p.status, area: p.area_code, n, m, pitch: (p.product_elevator_pitch ?? '').slice(0, 40) })
  }
  const tot = mergeCounts(per)
  if (process.argv.includes('--json')) { console.log(JSON.stringify({ tot, top }, null, 1)); return }
  console.log(`[1차 미판정 사유 — 소스 ${want.join(',')} · 소비재 스위치 ${skipConsumer ? 'on' : 'off'} · HN 저가치 ${prefilterCfg?.hn.mode ?? '설정 확인 불가'} · 제외 소스 ${excludedSources.join(',') || '(없음)'}]`)
  for (const [src, b] of Object.entries(tot)) console.log(`- ${src}: ${Object.entries(b).sort((a, c) => c[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' · ')}`)
  console.log('- 미판정 많은 프로젝트 10곳:')
  for (const t of top.sort((a, b) => b.n - a.n).slice(0, 10)) console.log(`  - ${t.id} [${t.status} · 영역 ${t.area ?? 'NULL'}] ${t.n}건 — ${t.pitch} :: ${JSON.stringify(t.m)}`)
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) await main()
