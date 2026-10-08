#!/usr/bin/env node
// 사전필터 오탈락률 측정 표본(v31 항목 5) — **읽기 전용.** DB 쓰기·LLM 호출 없음.
//
// 걸렸을 후보(현재 config/prefilter-rules.json 기준으로 다시 계산) 중 영역×소스 층별로 n건(기본 200)을
// 재현 가능한 seed 로 뽑아, (1) 입력 id 목록 (2) 기존 T2 판정으로 잰 오탈락률 (3) 판정 없는 표본의 T2 재판정 입력
// (judgeRelevanceBatch(purpose, reviews) 그대로 넣을 수 있는 모양)을 낸다. 절차·문턱은 docs/prefilter-shadow.md.
//
// shadow 모드에서는 걸린 입력도 T2 가 그대로 판정하므로, T2 표본(상위 200) 안의 후보는 재판정 없이 바로 잰다.
//
// 사용:
//   node --env-file=.env.local scripts/prefilter-falsedrop-sample.mjs [--n=200] [--seed=42] [--projects=<id,id>] [--out=<file.json>]
//   node scripts/prefilter-falsedrop-sample.mjs --input=<fixture.json>   # 오프라인({projects,inputs,verdicts})
//   ... --graded=<file.json>   # 재판정·사람 채점 결과 [{input_id, verdict}] 를 덧씌워 다시 잰다(사람 채점처럼 기존 판정을 이긴다)
//
// 종료코드: 0 측정 완료(판단 relax·enforce_ok·insufficient 는 출력에) · 2 설정/조회 실패

import fs from 'node:fs'
import { areaOfProject, buildFalseDropSample, loadPrefilterConfig } from '../lib/analysis/prefilter.ts'

const args = process.argv.slice(2)
const opt = (k) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3)
const n = Number(opt('n') ?? 200)
const seed = Number(opt('seed') ?? 42)
const fail = (m) => { console.error(`✗ ${m}`); process.exit(2) }
if (!Number.isInteger(n) || n <= 0 || !Number.isInteger(seed)) fail('--n·--seed 는 정수')

const { cfg, error, warnings } = loadPrefilterConfig()
if (!cfg) fail(`사전필터 설정 확인 불가: ${error}`)
for (const w of warnings) console.error(`⚠️ 설정: ${w}`)

let projects, inputs, verdicts
const inputFile = opt('input')
if (inputFile) {
  ;({ projects = [], inputs = [], verdicts = [] } = JSON.parse(fs.readFileSync(inputFile, 'utf8')))
} else {
  const { createClient } = await import('../lib/supabase/server.ts')
  const supabase = await createClient()
  if (!supabase) fail('DB 연결 실패 — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 확인')
  /** PostgREST 기본 1,000행 상한 — 끝까지 페이지를 넘긴다. 실패는 던진다(0건으로 접지 않는다, §7.1). */
  const all = async (build) => {
    const out = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await build().range(from, from + 999)
      if (error) throw new Error(error.message)
      out.push(...(data ?? []))
      if (!data || data.length < 1000) return out
    }
  }
  const only = opt('projects')?.split(',').map((s) => s.trim()).filter(Boolean)
  try {
    const ps = await all(() => { const q = supabase.from('analysis_projects').select('id, product_elevator_pitch, purpose, business_model').order('id'); return only ? q.in('id', only) : q })
    const ids = ps.map((p) => p.id)
    // .in(ids) 는 프로젝트가 수백 개면 URL 길이를 넘는다 — 전부 읽고 여기서 거른다(두 표 모두 작다).
    const idSet = new Set(ids)
    const targets = (await all(() => supabase.from('review_targets').select('project_id, label').order('id'))).filter((t) => idSet.has(t.project_id))
    projects = ps.map((p) => ({ ...p, area: areaOfProject(targets.filter((t) => t.project_id === p.id).map((t) => t.label)) }))
    inputs = []
    for (const id of ids) {
      const cols = 'id, project_id, raw_text, source_key, rating, created_at, collected_at'
      try {
        inputs.push(...(await all(() => supabase.from('analysis_inputs').select(cols).eq('project_id', id).is('purged_at', null).order('id'))))
      } catch (e) {
        // rating 컬럼 없음(20261005000001 미적용)만 컬럼 빼고 다시 — 그 밖의 오류는 그대로 실패다.
        if (!/rating/.test(String(e.message))) throw e
        console.error('⚠️ analysis_inputs.rating 없음 — 평점 규칙 없이 잰다')
        inputs.push(...(await all(() => supabase.from('analysis_inputs').select(cols.replace(', rating', '')).eq('project_id', id).is('purged_at', null).order('id'))))
      }
    }
    verdicts = (await all(() => supabase.from('review_relevance_verdicts').select('input_id, project_id, verdict, human_verdict').order('input_id'))).filter((v) => idSet.has(v.project_id))
  } catch (e) {
    fail(`조회 실패: ${e.message}`)
  }
}

const gradedFile = opt('graded')
if (gradedFile) {
  const graded = new Map(JSON.parse(fs.readFileSync(gradedFile, 'utf8')).map((g) => [g.input_id, g.verdict]))
  verdicts = verdicts.map((v) => (graded.has(v.input_id) ? { ...v, human_verdict: graded.get(v.input_id) } : v))
  for (const [input_id, verdict] of graded) if (!verdicts.some((v) => v.input_id === input_id)) verdicts.push({ input_id, verdict: null, human_verdict: verdict })
}

const r = buildFalseDropSample({ projects, inputs, verdicts, cfg, n, seed })
const pct = (x) => (x == null ? '확인 불가' : `${(x * 100).toFixed(1)}%`)
const result = {
  generated_at: new Date().toISOString(),
  seed, n, config_mode: cfg.mode,
  population: { total_flagged: r.totalFlagged, by_stratum: r.population },
  overall: r.overall, weighted_rate: r.weightedRate, by_stratum: r.byStratum,
  stratum_alerts: r.stratumAlerts, strata_thin: r.strataThin, decision: r.decision,
  ids: r.ids,
  sample: r.sample.map(({ text, ...s }) => s),
  rejudge: r.rejudge,
}
const out = opt('out')
if (out) fs.writeFileSync(out, JSON.stringify(result, null, 2))
else console.log(JSON.stringify(result, null, 2))

console.error(
  `걸렸을 후보 ${r.totalFlagged}건 → 표본 ${r.sample.length}/${n}건(seed ${seed}) · 관련 ${r.overall.relevant} · 무관 ${r.overall.irrelevant} · unknown ${r.overall.unknown} · 미판정 ${r.overall.unjudged}` +
    ` · 오탈락률 표본 ${pct(r.overall.rate)} · 모집단 가중 ${pct(r.weightedRate)}` +
    (r.stratumAlerts.length ? ` · 층 경보 ${r.stratumAlerts.join(', ')}` : '') +
    (r.strataThin.length ? ` · 판정 부족 층(확인 불가) ${r.strataThin.length}개` : '') +
    ` · 판단 ${r.decision}` +
    (r.decision === 'insufficient' ? ' — 판정된 표본이 모자라다. rejudge 를 T2 로 재판정하거나 사람이 채점해 --graded 로 다시 잰다' : '') +
    (r.decision === 'relax' ? ' — 표본·가중·층 중 하나라도 5% 초과: config/prefilter-rules.json 완화 후 재측정' : '') +
    (r.decision === 'enforce_ok' ? ' — 5% 이하: 사람이 mode=enforce 로 바꿀 수 있다(코드는 바꾸지 않는다)' : ''),
)
