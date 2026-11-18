#!/usr/bin/env node
// [v71ct] 스토리 꼬리표: 인터뷰 전문 1편 → ss_story_labels 1줄 + ss_episode_tags N줄(추가 전용).
// 시험(DB 쓰기 0):  node --env-file=.env.local scripts/story-label.mjs --model sonnet --set sample50 --dry --run test_v1
// SaaS 788:          node --env-file=.env.local scripts/story-label.mjs --model sonnet --set saas --run v1
// 이어하기: 같은 --run 으로 다시 돌리면 이미 적재된 slug 는 건너뛴다. label_run = `${run}_${model}`.
// 전문은 PC ~/sa-private/ground/starterstory/starterstory_stories_3314.jsonl.gz 에서만 읽는다(DB 에 넣지 않는다).
import fs from 'node:fs'
import os from 'node:os'
import zlib from 'node:zlib'
import path from 'node:path'
import crypto from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { buildSystem, buildUser, firstJson, validate } from '../lib/story-label/core.mjs'

const arg = (k, d = null) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d }
const has = (k) => process.argv.includes(`--${k}`)
// [모델 ID, 입력, 출력] USD / 1M tokens. 캐시 쓰기 1.25배·읽기 0.1배. 배치는 --batch-discount 로 반값 환산(실행 방식은 별도).
const MODELS = { haiku: ['claude-haiku-5-5', 0.8, 4], sonnet: ['claude-sonnet-5-5', 3, 15], opus: ['claude-opus-5-5', 15, 75] }
const TAG = arg('model', 'sonnet')
const [MODEL, P_IN, P_OUT] = MODELS[TAG]
const SET = arg('set', 'sample50')
const DRY = has('dry')
const THINK = has('thinking') // 기본은 생각 끔(출력 토큰·비용 절감, 아래 비용 방법으로 시험). --thinking 으로 켠다
const EFFORT = arg('effort')
const CONC = Number(arg('concurrency', 5))
const MAX_USD = Number(arg('max-usd', 120))
const RUN = `${arg('run', 'v1')}_${TAG}`
const OUT_DIR = 'reports/2026-11-18'
const GROUND = path.join(os.homedir(), 'sa-private/ground/starterstory/starterstory_stories_3314.jsonl.gz')
const SOURCE_KEY = 'starterstory'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── 데이터 로드 ───────────────────────────────────────────────
const stories = zlib.gunzipSync(fs.readFileSync(GROUND)).toString().split('\n').filter(Boolean).map((l) => JSON.parse(l))
const bySlug = new Map(stories.map((s) => [s.slug, s]))

async function allRows(table, cols, filter = (q) => q) {
  const out = []
  for (let p = 0; ; p++) {
    const { data, error } = await filter(sb.from(table).select(cols)).order('id').range(p * 1000, p * 1000 + 999)
    if (error) { console.error(table, error.message); process.exit(2) }
    out.push(...data); if (data.length < 1000) break
  }
  return out
}
const dbMoves = await allRows('ss_moves', 'id, slug, move_idx, lever, move, result')
const movesBySlug = new Map()
for (const m of dbMoves) { if (!movesBySlug.has(m.slug)) movesBySlug.set(m.slug, []); movesBySlug.get(m.slug).push(m) }
for (const a of movesBySlug.values()) a.sort((x, y) => x.move_idx - y.move_idx)
const { data: defs, error: defErr } = await sb.from('ss_chapter_defs').select('chapter, name_ko, definition_ko').order('chapter')
if (defErr) { console.error('ss_chapter_defs', defErr.message); process.exit(2) }
const validChapters = new Set(defs.map((d) => d.chapter))
const extraChapters = defs.filter((d) => d.chapter >= 9)
const SYSTEM = buildSystem(extraChapters)

// ── 대상 집합 ────────────────────────────────────────────────
// "SaaS 계열" 정의(지시서에 정의가 없어 역산 — 일일 로그에 근거 기록): DB 에 행동이 있고 전문이 있는 스토리 중
// category ∈ SAAS_CATS 이거나 mentions_saas. 지시서 숫자 788 과 다를 수 있다(실측은 보고서에).
const SAAS_CATS = new Set(['saas', 'productivity', 'technology', 'seo', 'sales', 'communication', 'hiring', 'hr'])
const catOf = (slug) => bySlug.get(slug)?.category ?? movesBySlug.get(slug)?.[0]?.category
const usable = (s) => s && s.full_text && s.full_text.length >= 1500 && movesBySlug.has(s.slug)
const isSaas =(s) => SAAS_CATS.has(catOf(s.slug)) || s.mentions_saas === true
const h = (x, seed) => crypto.createHash('md5').update(x + seed).digest('hex')

const L25_COMPANIES = ['BASIS', 'Siteless', 'Gear Up Hiking', 'Honest FulPhilment', 'ThirstySprout', 'GMass', 'Pearls of Joy', 'The Money Maniac', 'Xero Shoes', 'Justin Welsh', 'Trini Pepper Sauce', 'AiFA Labs', 'Vidds', 'MakerBox', 'Blacker Yarns', 'Pogr', 'Ro Anwar Fitness', 'Templated', 'Predis', 'Monapp Calabs', 'Delicious Denver Food Tours', 'The Office Providers', 'Rex Marketing and CX', 'Easy Song', 'Oz Moving & Storage', 'Knife Aid', 'Arsenal Health and Fitness', 'Gold Pan Pete Design', 'Hagan Ski', 'Natural Girl', 'Reflect', 'carazocreative', 'Inventora', 'Etramping', '3D Universe', 'MTN SIDE BUILDERS', 'Tediber', 'SI Certs', 'Finn and Remy', 'Love & Logic', 'Lessons By Brooke', 'bestcourses', 'Lone Fir Creative', 'TAB Performance', 'Thrive Parenting', 'Sene', 'RailsDevs', 'Urban Betty']

function pickTargets() {
  if (SET === 'saas') return stories.filter((s) => usable(s) && isSaas(s)).sort((a, b) => a.slug.localeCompare(b.slug))
  if (SET === 'all') return stories.filter(usable).sort((a, b) => a.slug.localeCompare(b.slug))
  if (SET.startsWith('ids:')) { const want = JSON.parse(fs.readFileSync(SET.slice(4), 'utf8')); return want.map((s) => bySlug.get(s)).filter(Boolean) }
  if (SET === 'sample50') {
    const sampleFile = `${OUT_DIR}/story-label-sample50.json`
    if (fs.existsSync(sampleFile)) return JSON.parse(fs.readFileSync(sampleFile, 'utf8')).map((s) => bySlug.get(s)).filter(Boolean)
    // L25 줄이 속한 스토리 전부(회사명 일치) + SaaS 20 + 그 외 30(채움). 같은 파일을 모든 모델이 쓴다.
    const l25 = []; for (const c of L25_COMPANIES) { const m = stories.filter((s) => usable(s) && (s.company ?? '').toLowerCase().replace(/\(.*?\)/g, '').trim() === c.toLowerCase()); if (m[0]) l25.push(m[0]) }
    const l25Slugs = new Set(l25.map((s) => s.slug))
    const rest = stories.filter((s) => usable(s) && !l25Slugs.has(s.slug)).sort((a, b) => (h(a.slug, 'v71ct') < h(b.slug, 'v71ct') ? -1 : 1))
    const saas = rest.filter(isSaas), non = rest.filter((s) => !isSaas(s))
    const l25Saas = l25.filter(isSaas).length
    // L25 중 SaaS 가 이미 일부 — 총 SaaS 20 이상, 총 50 이 되도록 채운다.
    const needSaas = Math.max(0, 20 - l25Saas)
    const picked = [...l25, ...saas.slice(0, needSaas)]
    picked.push(...non.slice(0, Math.max(0, 50 - picked.length)))
    const out = picked.slice(0, Math.max(50, l25.length + needSaas))
    fs.mkdirSync(OUT_DIR, { recursive: true })
    fs.writeFileSync(sampleFile, JSON.stringify(out.map((s) => s.slug)))
    console.log(`[sample50] L25 스토리 ${l25.length}/${L25_COMPANIES.length}곳 일치, SaaS ${out.filter(isSaas).length}, 합 ${out.length}`)
    return out
  }
  console.error('알 수 없는 --set'); process.exit(1)
}

// ── 호출 ─────────────────────────────────────────────────────
let thinkOff = 'between_tools' // 이 모델 계열이 요구하는 '생각 끔' 값(400 이 알려 주면 바꾼다)
let inT = 0, outT = 0, cwT = 0, crT = 0
const cost = () => (inT * P_IN + cwT * P_IN * 1.25 + crT * P_IN * 0.1 + outT * P_OUT) / 1e6
async function call(story, moves) {
  for (let a = 0; ; a++) {
    try {
      const msg = await client.messages.create({
        model: MODEL, max_tokens: 8000, ...(THINK ? {} : TAG === 'sonnet' ? { thinking: { type: thinkOff } } : {}), ...(EFFORT || TAG !== 'sonnet' ? { output_config: { effort: EFFORT ?? 'low' } } : {}),
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: buildUser(story, moves) }],
      })
      const u = msg.usage
      inT += u.input_tokens ?? 0; outT += u.output_tokens ?? 0; cwT += u.cache_creation_input_tokens ?? 0; crT += u.cache_read_input_tokens ?? 0
      return { raw: msg.content.filter((b) => b.type === 'text').map((b) => b.text).join(''), stop: msg.stop_reason, usage: u }
    } catch (e) {
      const st = e?.status
      if (st === 400 && /thinking/.test(String(e?.message)) && a < 2) { thinkOff = thinkOff === 'between_tools' ? 'disabled' : 'between_tools'; continue }
      if (a < 5 && (st === 429 || st === 529 || st >= 500 || !st)) { await new Promise((r) => setTimeout(r, 2000 * 2 ** a)); continue }
      throw e
    }
  }
}

// ── 적재 ─────────────────────────────────────────────────────
async function save(story, moves, v) {
  const sha = crypto.createHash('sha256').update(story.full_text).digest('hex')
  const row = { source_key: SOURCE_KEY, slug: story.slug, label_run: RUN, label_model: MODEL, source_text_sha256: sha, text_depth: 'story', ...v.story }
  const { error } = await sb.from('ss_story_labels').upsert(row, { onConflict: 'source_key,slug,label_run', ignoreDuplicates: true })
  if (error) throw new Error('story 적재 ' + error.message)
  const moveId = new Map(moves.map((m) => [m.move_idx, m.id]))
  const eps = v.episodes.map(({ _move_idx, ...e }) => ({ source_key: SOURCE_KEY, slug: story.slug, label_run: RUN, label_model: MODEL, text_depth: 'story', move_id: _move_idx != null ? moveId.get(_move_idx) ?? null : null, ...e }))
  const r2 = await sb.from('ss_episode_tags').upsert(eps, { onConflict: 'source_key,slug,label_run,episode_idx', ignoreDuplicates: true })
  if (r2.error) throw new Error('episode 적재 ' + r2.error.message)
}

// ── 실행 ─────────────────────────────────────────────────────
fs.mkdirSync(OUT_DIR, { recursive: true })
let targets = pickTargets()
if (!DRY) {
  const done = new Set(); for (let p = 0; ; p++) { const { data, error } = await sb.from('ss_story_labels').select('slug').eq('label_run', RUN).range(p * 1000, p * 1000 + 999); if (error) { console.error(error.message); process.exit(2) } data.forEach((r) => done.add(r.slug)); if (data.length < 1000) break }
  targets = targets.filter((s) => !done.has(s.slug))
}
if (arg('limit')) targets = targets.slice(0, Number(arg('limit')))
console.log(`[story-label ${RUN}] set=${SET} 대상 ${targets.length}편 dry=${DRY} 장=${[...validChapters]}`)

const OUT = `${OUT_DIR}/story-label-${RUN}.jsonl`
const agg = { n: 0, ok: 0, badJson: 0, structure: 0, err: 0, quoteTotal: 0, quoteFail: 0, numTotal: 0, numFail: 0, basisDropped: 0, epTotal: 0, truncated: 0 }
const proposals = []
let idx = 0, stop = null
const t0 = Date.now()
function check() {
  const quoteRate = agg.quoteTotal ? agg.quoteFail / agg.quoteTotal : 0, jsonRate = agg.n ? (agg.badJson + agg.err) / agg.n : 0
  if (agg.n >= 100 && agg.n % 100 < CONC) {
    if (quoteRate > 0.02) stop = `인용 대조 실패 ${(quoteRate * 100).toFixed(1)}% > 2% (n=${agg.n})`
    if (jsonRate > 0.05) stop = `JSON 실패 ${(jsonRate * 100).toFixed(1)}% > 5% (n=${agg.n})`
  }
  if (cost() > MAX_USD) stop = `비용 $${cost().toFixed(2)} > 상한 $${MAX_USD}`
}
await Promise.all(Array.from({ length: CONC }, async () => {
  while (idx < targets.length && !stop) {
    const s = targets[idx++], moves = movesBySlug.get(s.slug) ?? []
    let rec = { slug: s.slug, company: s.company }
    try {
      const r = await call(s, moves)
      if (r.stop === 'max_tokens') agg.truncated++
      const v = validate(firstJson(r.raw), { story: s, moves, validChapters })
      agg.n++; Object.assign(rec, { flags: v.flags, usage: r.usage, ok: v.ok })
      if (v.flags.badJson) { agg.badJson++ } else {
        agg.quoteTotal += v.flags.quoteTotal; agg.quoteFail += v.flags.quoteFail; agg.numTotal += v.flags.numTotal; agg.numFail += v.flags.numFail; agg.basisDropped += v.flags.basisDropped; agg.epTotal += v.flags.epCount
        if (v.proposal) proposals.push({ slug: s.slug, ...v.proposal })
        if (!v.ok) agg.structure++
        else { agg.ok++; rec.story = v.story; rec.episodes = v.episodes; rec.failedAttemptsFound = v.failedAttemptsFound; if (!DRY) await save(s, moves, v) }
      }
    } catch (e) { agg.err++; agg.n++; rec.error = String(e?.message ?? e).slice(0, 200); if (agg.err <= 5) console.error('오류', s.slug, rec.error) }
    fs.appendFileSync(OUT, JSON.stringify(rec) + '\n')
    if (agg.n % 50 === 0) console.log(`[story-label] ${agg.n}/${targets.length} ok=${agg.ok} 누적 $${cost().toFixed(3)} (${((Date.now() - t0) / 60000).toFixed(1)}분)`)
    check()
  }
}))
const summary = { run: RUN, model: MODEL, set: SET, targets: targets.length, ...agg, cost_usd: Number(cost().toFixed(4)), per_story_usd: Number((cost() / Math.max(1, agg.n)).toFixed(4)), minutes: Number(((Date.now() - t0) / 60000).toFixed(1)),
  tokens: { in: inT, cache_write: cwT, cache_read: crT, out: outT }, quote_fail_rate: agg.quoteTotal ? Number((agg.quoteFail / agg.quoteTotal).toFixed(4)) : null, number_fail_rate: agg.numTotal ? Number((agg.numFail / agg.numTotal).toFixed(4)) : null, stopped: stop }
console.log(JSON.stringify(summary))
fs.writeFileSync(`${OUT_DIR}/story-label-${RUN}.summary.json`, JSON.stringify({ summary, proposals }, null, 1))
if (stop) process.exitCode = 5
