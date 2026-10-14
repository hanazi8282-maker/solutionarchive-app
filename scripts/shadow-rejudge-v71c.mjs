#!/usr/bin/env node
// v71c L-20 하위 — 적체(AUTO_APPROVAL_SINCE 이전 1차 relevant) 그림자 재판정. 읽기 전용: DB 에 쓰지 않는다.
//   node --env-file=.env.local scripts/shadow-rejudge-v71c.mjs --plan               # 표본만 뽑아 모집단·층화표 출력(LLM 없음)
//   node --env-file=.env.local scripts/shadow-rejudge-v71c.mjs --run [--n=300] [--seed=71301]
// 표본: 소스×영역 비례 층화(최대잔여법), 시드 고정. 판정: 현재 기준(v22) 1차(claude-cli) + 독립 2차(Gemini). 옛 판정은 비교용으로만 읽는다.
// 쓰기: reports/<KST>/shadow-rejudge-v71c.json(input_id·판정만 — 원문 없음, 공개 리포). 기존 verdict·승인 상태·AUTO_APPROVAL_SINCE 는 건드리지 않는다.
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

/** 최대잔여법 비례 배분. strata: {key,size}[] → Map(key→할당). 합이 n 이 되고 할당 ≤ size. */
export function allocate(strata, n) {
  const total = strata.reduce((s, x) => s + x.size, 0)
  if (total === 0) return new Map()
  const want = Math.min(n, total)
  const base = strata.map((x) => {
    const exact = (x.size * want) / total
    return { key: x.key, size: x.size, take: Math.floor(exact), frac: exact - Math.floor(exact) }
  })
  let left = want - base.reduce((s, x) => s + x.take, 0)
  for (const x of [...base].sort((a, b) => b.frac - a.frac || b.size - a.size || (a.key < b.key ? -1 : 1))) {
    if (left <= 0) break
    if (x.take < x.size) { x.take += 1; left -= 1 }
  }
  return new Map(base.map((x) => [x.key, x.take]))
}

/** Wilson 95% 구간. */
export function wilson(k, n, z = 1.96) {
  if (n === 0) return [null, null]
  const p = k / n
  const d = 1 + (z * z) / n
  const c = p + (z * z) / (2 * n)
  const m = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  return [(c - m) / d, (c + m) / d]
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url
if (isMain) await main()

async function main() {
  const args = process.argv.slice(2)
  const opt = (k, d) => (args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3)) ?? d
  const N = Number(opt('n', 300))
  const SEED = Number(opt('seed', 71301))
  const run = args.includes('--run')
  const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`)
  const { createClient } = await import('../lib/supabase/server.ts')
  const { loadScope } = await import('../lib/analysis/approval-scope.ts')
  const { rng, shuffle } = await import('../lib/analysis/relevance-judge.ts')
  const sb = await createClient()
  if (!sb) { console.error('✗ DB 연결 실패'); process.exit(2) }
  const POP = opt('pop', 'pre') // pre = since 이전(옛 기준 판정) · post = since 이후(2차 대기 중인 실제 적체)
  const since = new Date(process.env.AUTO_APPROVAL_SINCE || '2026-09-28T12:30:00Z')

  // 1. 모집단 — 1,000행 상한에서 잘리지 않게 끝까지 읽고, 별도 count 쿼리와 맞춘다.
  const pop = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('review_relevance_verdicts')
      .select('input_id, project_id, verdict, product_informative, second_verdict, model, judged_at, human_verdict, auto_approved_at')
      .eq('verdict', 'relevant').is('auto_approved_at', null).is('second_verdict', null).is('human_verdict', null)
      .filter('judged_at', POP === 'pre' ? 'lt' : 'gte', since.toISOString())
      .order('input_id').range(from, from + 999)
    if (error) { console.error(`✗ 모집단 조회 실패: ${error.message}`); process.exit(2) }
    pop.push(...data)
    if (data.length < 1000) break
  }
  const { count, error: cErr } = await sb.from('review_relevance_verdicts').select('input_id', { count: 'exact', head: true })
    .eq('verdict', 'relevant').is('auto_approved_at', null).is('second_verdict', null).is('human_verdict', null)
    .filter('judged_at', POP === 'pre' ? 'lt' : 'gte', since.toISOString())
  if (cErr) { console.error(`✗ 모집단 count 실패: ${cErr.message}`); process.exit(2) }
  log(`모집단[${POP}] 1차 relevant ∧ 2차·사람·자동승인 없음 읽음 ${pop.length} / count ${count} — ${pop.length === count ? '일치(잘림 없음)' : '불일치!'}`)
  if (pop.length !== count) process.exit(2)

  // 2. 소스·영역·원문 메타
  const meta = new Map()
  const ids = pop.map((r) => r.input_id)
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await sb.from('analysis_inputs').select('id, source_key, purged_at').in('id', ids.slice(i, i + 200))
    if (error) { console.error(`✗ 원문 메타 조회 실패: ${error.message}`); process.exit(2) }
    for (const x of data) meta.set(x.id, x)
  }
  const pids = [...new Set(pop.map((r) => r.project_id))]
  const proj = new Map()
  for (let i = 0; i < pids.length; i += 100) {
    const { data, error } = await sb.from('analysis_projects').select('id, area_code, business_model, product_elevator_pitch, purpose, reader_problem').in('id', pids.slice(i, i + 100))
    if (error) { console.error(`✗ 프로젝트 조회 실패: ${error.message}`); process.exit(2) }
    for (const p of data) proj.set(p.id, p)
  }
  const live = pop.filter((r) => meta.has(r.input_id) && !meta.get(r.input_id).purged_at && proj.has(r.project_id))
  log(`살아있는 원문·프로젝트 확인된 행 ${live.length} (제외 ${pop.length - live.length})`)
  const keyOf = (r) => `${meta.get(r.input_id).source_key}|${proj.get(r.project_id).area_code ?? 'null'}`
  const groups = new Map()
  for (const r of live) { const k = keyOf(r); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r) }
  const alloc = allocate([...groups].map(([key, v]) => ({ key, size: v.length })), N)
  const random = rng(SEED)
  const picked = []
  for (const [key, take] of [...alloc].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    picked.push(...shuffle(groups.get(key).sort((a, b) => (a.input_id < b.input_id ? -1 : 1)), random).slice(0, take))
  }
  log(`층화 ${groups.size}개 → 표본 ${picked.length}건 · 시드 ${SEED}`)
  const strata = [...alloc].filter(([, t]) => t > 0).map(([k, t]) => `${k}:${t}/${groups.get(k).length}`)
  console.log(strata.join('\n'))
  if (!run) { log('--plan: 여기서 끝(LLM 없음).'); return }

  // 3. 판정
  process.env.LLM_PROVIDER = 'claude-cli'
  const { judgeRelevanceBatch, chunkReviews } = await import('../lib/analysis/relevance-judge.ts')
  const { callGeminiRotating, parseJsonObject } = await import('../lib/analysis/llm.ts')
  const { withLlmBudget } = await import('../lib/analysis/budget.ts')
  const { SECOND_OPINION_INSTRUCTIONS_V22, secondOpinionUserPrompt, toExportRow, validateOpinions } = await import('../lib/analysis/second-opinion.ts')
  const { RELEVANCE_V22_VERSION } = await import('../lib/analysis/relevance-criteria.ts')

  const raw = new Map()
  const pickedIds = picked.map((r) => r.input_id)
  for (let i = 0; i < pickedIds.length; i += 100) {
    const { data, error } = await sb.from('analysis_inputs').select('id, raw_text').in('id', pickedIds.slice(i, i + 100))
    if (error) { console.error(`✗ 원문 조회 실패: ${error.message}`); process.exit(2) }
    for (const x of data) raw.set(x.id, x.raw_text ?? '')
  }
  // few-shot: 야간과 같은 규칙(최근 사람 채점 10건)이되 표본 자신은 뺀다.
  const { data: ex } = await sb.from('review_relevance_verdicts').select('input_id, human_verdict').in('human_verdict', ['relevant', 'irrelevant']).order('human_graded_at', { ascending: false }).limit(40)
  const exIds = (ex ?? []).filter((e) => !pickedIds.includes(e.input_id)).slice(0, 10)
  const { data: exTexts } = await sb.from('analysis_inputs').select('id, raw_text').in('id', exIds.map((e) => e.input_id))
  const exMap = new Map((exTexts ?? []).map((t) => [t.id, t.raw_text]))
  const examples = exIds.map((e) => ({ text: exMap.get(e.input_id) ?? '', verdict: e.human_verdict })).filter((e) => e.text)
  log(`few-shot ${examples.length}건 · 기준 ${RELEVANCE_V22_VERSION}`)

  const out = new Map(picked.map((r) => [r.input_id, { input_id: r.input_id, source: meta.get(r.input_id).source_key, area: proj.get(r.project_id).area_code ?? null, business_model: proj.get(r.project_id).business_model ?? null, project_id: r.project_id, old_verdict: r.verdict, old_informative: r.product_informative ?? null, old_second: r.second_verdict ?? null, old_model: r.model, new_first: null, new_first_info: null, new_first_reason: null, new_second: null, new_second_info: null }]))
  const t0 = Date.now()
  const byProject = new Map()
  for (const r of picked) { if (!byProject.has(r.project_id)) byProject.set(r.project_id, []); byProject.get(r.project_id).push(r) }
  const stats = { first_batches: 0, first_err: 0, second_batches: 0, second_err: 0 }
  for (const [pid, rows] of byProject) {
    const p = proj.get(pid)
    for (const batch of chunkReviews(rows, 20)) {
      await withLlmBudget(async () => {
        const res = await judgeRelevanceBatch(p, batch.map((r) => ({ input_id: r.input_id, text: raw.get(r.input_id) })), examples, undefined, { criteria: 'v22' })
        stats.first_batches++
        if (res.error) { stats.first_err++; log(`  1차 오류(기록 안 함): ${res.error}`); return }
        for (const v of res.verdicts) { const o = out.get(v.input_id); o.new_first = v.verdict; o.new_first_info = v.product_informative; o.new_first_reason = (v.reason ?? '').slice(0, 80) }
      })
      const g = await callGeminiRotating(SECOND_OPINION_INSTRUCTIONS_V22, secondOpinionUserPrompt(batch.map((r) => toExportRow({ input_id: r.input_id, project_id: r.project_id, raw_text: raw.get(r.input_id), pitch: p.product_elevator_pitch, business_model: p.business_model }))), 'shadow-rejudge')
      stats.second_batches++
      if (!g.ok) { stats.second_err++; log(`  2차 오류(기록 안 함): ${g.reason}`); continue }
      try {
        const { ok } = validateOpinions(parseJsonObject(g.text))
        for (const o of ok) { const t = out.get(o.input_id); if (t) { t.new_second = o.verdict; t.new_second_info = o.product_informative ?? null } }
      } catch { stats.second_err++; log('  2차 JSON 파싱 실패(기록 안 함)') }
      log(`진행 1차 ${stats.first_batches} · 2차 ${stats.second_batches} · ${(Date.now() - t0) / 1000 | 0}s`)
    }
  }
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(new Date())
  // L-20b 전후 비교용: 각 행이 새 제외 규칙(영역 외·소비재 태그)에 걸리는지 붙인다. 못 읽으면 null(걸림 여부를 모른다).
  const sc = await loadScope(sb, [...out.keys()])
  for (const r of out.values()) r.l20b_excluded = sc.ok ? (sc.excluded.get(r.input_id) ?? null) : undefined
  if (!sc.ok) log(`⚠️ L-20b 제외 판정 조회 실패 — ${sc.error}`)
  // --tag=<이름> 이면 파일 이름에 붙여 v71c 원본 결과를 덮어쓰지 않는다.
  const TAG = opt('tag', '')
  const file = path.join('reports', today, `shadow-rejudge-v71c-${POP}${TAG ? `-${TAG}` : ''}.json`)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const payload = { seed: SEED, n_requested: N, population: pop.length, since: since.toISOString(), criteria: RELEVANCE_V22_VERSION, elapsed_s: Math.round((Date.now() - t0) / 1000), stats, strata, rows: [...out.values()] }
  fs.writeFileSync(file, JSON.stringify(payload, null, 1))
  log(`저장 ${file} — 1차 오류 ${stats.first_err} · 2차 오류 ${stats.second_err} · 소요 ${payload.elapsed_s}s`)
}
