#!/usr/bin/env node
// 영상 제목 주입 병행 측정 — 미판정 YouTube 댓글 N건(기본 100)을 제목 없이(A)/있이(B) 같은 판정기로 두 번 판정해
// unknown(애매) 비율 차이를 낸다. **드라이런 전용**: review_relevance_verdicts 를 포함해 DB 에 아무것도 쓰지 않는다. 결과는 파일만.
//
// 공정성: 두 쪽 모두 같은 프로젝트 목적·같은 묶음·few-shot 없음. 다른 것은 B 의 `영상 제목: …(채널: …)` 한 줄뿐이다
//   (lib/analysis/relevance-judge.ts RelevancePromptOptions, VIDEO_TITLE_PROMPT_VERSION).
//   운영 판정은 few-shot 을 넣으므로 절대 비율은 운영과 다를 수 있다 — 보는 것은 A/B 차이다.
// 표본: source_key='youtube' · 원문이 남아 있고(purge 전) · 판정 행이 없는 것 중 최근 수집 순 N건.
// 출력 파일에는 원문·제목을 싣지 않는다(공개 리포) — input_id·video_id·판정만.
//
// 사용:
//   node --env-file=.env.local scripts/youtube-title-ab-measure.mjs              # 표본·제목 커버리지만(LLM 0회)
//   node --env-file=.env.local scripts/youtube-title-ab-measure.mjs --run        # 실제 A/B 판정(LLM 호출 = 묶음 수 × 2)
//   ... --n 100 --out reports/youtube-title-ab/x.json
//
// 종료코드: 0 정상 · 2 설정/조회 실패(youtube_videos 미적용 포함) · 4 한도/예산으로 중간 정지(부분 결과는 파일에 남긴다)

import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '../lib/supabase/server.ts'
import { requiredKeyFor, resolveProvider } from '../lib/analysis/llm.ts'
import { withLlmBudget } from '../lib/analysis/budget.ts'
import { BATCH_SIZE, VIDEO_TITLE_PROMPT_VERSION, chunkReviews, judgeRelevanceBatch } from '../lib/analysis/relevance-judge.ts'
import { parseSourceContext } from '../lib/relevance-feedback/translate.ts'

const args = process.argv.slice(2)
const opt = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : args.find((a) => a.startsWith(`${name}=`))?.slice(name.length + 1)
}
const run = args.includes('--run')
const n = Math.max(1, Math.min(500, Math.floor(Number(opt('--n') ?? 100)) || 100))
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16)
const outPath = opt('--out') ?? path.join('reports', 'youtube-title-ab', `${stamp}.json`)
const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`)
const fatal = (code, m) => {
  console.error(`✗ ${m}`)
  process.exit(code)
}

const provider = resolveProvider()
const requiredKey = requiredKeyFor(provider)
if (run && requiredKey && !process.env[requiredKey]) fatal(2, `${requiredKey} 가 없다(provider=${provider}) — --run 을 시작하지 않는다`)
if (run && provider === 'mock') fatal(2, 'provider=mock 은 전부 unknown 을 돌려준다 — 측정이 안 된다. LLM_PROVIDER 를 확인')

const supabase = await createClient()
if (!supabase) fatal(2, 'DB 연결 실패 — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 확인')

// ── 1. 제목 표 ───────────────────────────────────────────────────
const { data: videos, error: vErr } = await supabase.from('youtube_videos').select('video_id, title, channel')
if (vErr) fatal(2, `youtube_videos 조회 실패: ${vErr.code ?? ''} ${vErr.message} — 마이그 20261012000040 적용·scripts/youtube-video-titles.mjs --apply 가 먼저다`)
const videoTitles = new Map((videos ?? []).map((v) => [v.video_id, { title: v.title, channel: v.channel }]))
if (videoTitles.size === 0) fatal(2, 'youtube_videos 가 비어 있다 — scripts/youtube-video-titles.mjs --apply 를 먼저 돌린다(B 가 A 와 같아져 측정이 안 된다)')

// ── 2. 표본: 미판정 YouTube 댓글 최근 N건 ───────────────────────
const PAGE = 200
const MAX_PAGES = 60
const sample = []
let scanned = 0
for (let page = 0; page < MAX_PAGES && sample.length < n; page++) {
  const { data, error } = await supabase
    .from('analysis_inputs')
    .select('id, project_id, raw_text')
    .eq('source_key', 'youtube')
    .order('collected_at', { ascending: false })
    .order('id', { ascending: true })
    .range(page * PAGE, page * PAGE + PAGE - 1)
  if (error) fatal(2, `analysis_inputs 조회 실패: ${error.message}`)
  if (!data || data.length === 0) break
  scanned += data.length
  const live = data.filter((r) => (r.raw_text ?? '').trim())
  const { data: judged, error: jErr } = await supabase.from('review_relevance_verdicts').select('input_id').in('input_id', live.map((r) => r.id))
  if (jErr) fatal(2, `review_relevance_verdicts 조회 실패: ${jErr.message}`)
  const done = new Set((judged ?? []).map((j) => j.input_id))
  for (const r of live) if (!done.has(r.id) && sample.length < n) sample.push(r)
}
const videoOf = (text) => parseSourceContext('youtube', text).threadKey
const withTitle = sample.filter((r) => videoTitles.has(videoOf(r.raw_text) ?? '')).length
const noHeader = sample.filter((r) => !videoOf(r.raw_text)).length
log(`표본 ${sample.length}/${n}건(훑은 행 ${scanned}) · 제목 있음 ${withTitle}건 · 머리말 없음 ${noHeader}건 · 제목 표 ${videoTitles.size}개 영상`)
if (sample.length < n) log(`⚠️ 미판정 표본이 ${n}건에 못 미친다(상한 ${MAX_PAGES}페이지까지 훑음)`)
if (withTitle < sample.length) log(`⚠️ 제목 없는 ${sample.length - withTitle}건은 A·B 프롬프트가 같다 — 차이를 희석한다. 영상 ID 가 youtube_videos 에 빠졌는지 확인`)

// ── 3. 프로젝트 목적 ─────────────────────────────────────────────
const projectIds = [...new Set(sample.map((r) => r.project_id))]
const COLS = 'id, product_elevator_pitch, purpose, business_model'
let { data: projects, error: pErr } = await supabase.from('analysis_projects').select(`${COLS}, reader_problem`).in('id', projectIds)
if (pErr?.code === '42703') ({ data: projects, error: pErr } = await supabase.from('analysis_projects').select(COLS).in('id', projectIds))
if (pErr) fatal(2, `analysis_projects 조회 실패: ${pErr.message}`)
const projectById = new Map((projects ?? []).map((p) => [p.id, p]))

if (!run) {
  log(`--run 없음 — LLM 호출 없이 끝낸다. 실행하면 묶음 ${projectIds.reduce((s, id) => s + chunkReviews(sample.filter((r) => r.project_id === id), BATCH_SIZE).length, 0)}개 × 2회 호출(provider=${provider})`)
  process.exit(0)
}

// ── 4. A/B 판정 ──────────────────────────────────────────────────
const rows = []
const models = new Set()
let stopped = null
await withLlmBudget(async () => {
  for (const pid of projectIds) {
    const purpose = projectById.get(pid) ?? null
    const items = sample.filter((r) => r.project_id === pid).map((r) => ({ input_id: r.id, text: r.raw_text }))
    for (const batch of chunkReviews(items, BATCH_SIZE)) {
      const a = await judgeRelevanceBatch(purpose, batch, [])
      const b = a.quotaExhausted ? a : await judgeRelevanceBatch(purpose, batch, [], undefined, { videoTitles })
      if (a.quotaExhausted || b.quotaExhausted) {
        stopped = (a.quotaExhausted ? a.error : b.error) ?? '한도/예산 소진'
        return
      }
      models.add(a.model).add(b.model)
      const bById = new Map(b.verdicts.map((v) => [v.input_id, v]))
      for (const v of a.verdicts) {
        const text = batch.find((x) => x.input_id === v.input_id)?.text ?? ''
        const vid = videoOf(text)
        rows.push({ input_id: v.input_id, project_id: pid, video_id: vid, has_title: videoTitles.has(vid ?? ''), a: v.verdict, b: bById.get(v.input_id)?.verdict ?? 'unknown' })
      }
    }
  }
})

// ── 5. 집계 · 파일 ───────────────────────────────────────────────
const tally = (arm, filter = () => true) => {
  const sel = rows.filter(filter)
  const c = { relevant: 0, irrelevant: 0, unknown: 0 }
  for (const r of sel) c[r[arm]] += 1
  return { n: sel.length, ...c, unknown_rate: sel.length ? Number((c.unknown / sel.length).toFixed(4)) : null }
}
const flips = {}
for (const r of rows) if (r.a !== r.b) flips[`${r.a}→${r.b}`] = (flips[`${r.a}→${r.b}`] ?? 0) + 1
const result = {
  measured_at: new Date().toISOString(),
  prompt_version_b: VIDEO_TITLE_PROMPT_VERSION,
  provider,
  models: [...models],
  few_shot: 0,
  requested: n,
  sampled: sample.length,
  judged: rows.length,
  stopped,
  a_no_title: tally('a'),
  b_with_title: tally('b'),
  titled_only: { a: tally('a', (r) => r.has_title), b: tally('b', (r) => r.has_title) },
  flips,
  rows,
}
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`)

const pct = (x) => (x == null ? '-' : `${(x * 100).toFixed(1)}%`)
log(`A(제목 없음) unknown ${result.a_no_title.unknown}/${result.a_no_title.n} = ${pct(result.a_no_title.unknown_rate)} · 관련 ${result.a_no_title.relevant} · 무관 ${result.a_no_title.irrelevant}`)
log(`B(제목 있음) unknown ${result.b_with_title.unknown}/${result.b_with_title.n} = ${pct(result.b_with_title.unknown_rate)} · 관련 ${result.b_with_title.relevant} · 무관 ${result.b_with_title.irrelevant}`)
const d = result.a_no_title.unknown_rate != null ? result.b_with_title.unknown_rate - result.a_no_title.unknown_rate : null
log(`unknown 비율 차이(B−A) ${d == null ? '-' : `${(d * 100).toFixed(1)}%p`} · 판정 바뀐 건 ${Object.entries(flips).map(([k, v]) => `${k} ${v}`).join(' · ') || '0'}`)
log(`결과 파일: ${outPath} (DB 쓰기 0)`)
if (stopped) {
  console.error(`✗ 한도/예산으로 ${rows.length}/${sample.length}건에서 멈췄다 — 부분 결과다: ${stopped}`)
  process.exit(4)
}
process.exit(0)
