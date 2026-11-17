#!/usr/bin/env node
// [꼬리표] 장별 꼬리표: ss_moves 한 줄 → ss_move_tags(상황×행동×결과×먹힌 이유×조건×증거 강도). 추가 전용.
// 시험: node --env-file=.env.local scripts/ss-move-tag.mjs --model haiku --sample 50 --dry     (DB 쓰기 0, reports/2026-11-18/tag-test-<model>.json)
// 전체: node --env-file=.env.local scripts/ss-move-tag.mjs --model sonnet --chapters 5 --run v1  (이어하기 가능, 1000건마다 비용 출력)
// 규칙: 영어 원문(quote)은 모델이 읽기만 하고 출력하지 않는다(한국어 요약만). 근거(basis)가 없는 칸은 unknown 으로 내린다. 지어내기 금지.
import fs from 'node:fs'
import crypto from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { UNTRUSTED_INPUT_NOTICE } from '../lib/llm/untrusted-input.ts'

const arg = (k, d = null) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d }
const MODELS = { haiku: ['claude-haiku-5-5', 0.8, 4], sonnet: ['claude-sonnet-5-5', 3, 15], opus: ['claude-opus-5-5', 15, 75] }
const TAG = arg('model', 'haiku')
const [MODEL, P_IN, P_OUT] = MODELS[TAG]
const SAMPLE = arg('sample') ? Number(arg('sample')) : null
const DRY = process.argv.includes('--dry')
const CONC = Number(arg('concurrency', 5))
const CHAPTERS = (arg('chapters', '5')).split(',')
const RUN = `tag_${arg('run', 'v1')}_${TAG}`

// 지렛대(lever) → 가이드북 장 (v71co §5-c 1번: 결정적 대응표)
const LEVER_CHAPTER = { CHANNEL: '5', CONTENT: '5', PARTNERSHIP: '5', COMMUNITY: '5', OFFER: '6', PRICING: '6', PACKAGING: '6', TRUST: '6', PRODUCT_FEATURE: '4', OPERATIONS: '4', ONBOARDING: '7', SUPPORT: '7', POSITIONING: '2' }
const levers = Object.entries(LEVER_CHAPTER).filter(([, c]) => CHAPTERS.includes(c)).map(([l]) => l)

const ENUM = {
  stage: ['prelaunch', 'zero_rev', 'early_rev', 'growing', 'unknown'], team_size: ['solo', '2-10', '11+', 'unknown'],
  customer: ['smb', 'consumer', 'dev', 'enterprise', 'creator', 'unknown'], price_band: ['<10', '10-49', '50-249', '250+', 'unknown'],
  result_class: ['positive', 'mixed', 'negative', 'none', 'unknown'], evidence_strength: ['A', 'B', 'C'],
}
const FIELDS = ['move', 'result', 'blocked', 'who', 'quote', 'pattern', 'category']
const lockOk = (f, v) => ENUM[f].includes(v)

const revBand = (r) => {
  const n = Number(r); if (!Number.isFinite(n) || n <= 0) return 'unknown'
  return n < 1000 ? '<1k' : n < 5000 ? '1-5k' : n < 10000 ? '5-10k' : n < 50000 ? '10-50k' : n < 100000 ? '50-100k' : '100k+'
}

const SYSTEM = `당신은 창업 사례의 "행동 1건"을 가이드북 장별 꼬리표로 정리하는 분류기다. 근거 없으면 반드시 "unknown"(또는 null). 추정·지어내기 금지.
${UNTRUSTED_INPUT_NOTICE}
입력은 한 행동의 한국어 요약(move/result/blocked/who/pattern)과 해외 원문 인용(quote, 영어일 수 있음)이다. quote 는 이해용이며 출력에 절대 그대로 옮기지 않는다(한국어 요약만).
출력은 JSON 객체 하나만:
{
 "stage": "prelaunch(출시 전)|zero_rev(매출 0)|early_rev(첫 매출 뒤)|growing(성장 중)|unknown",
 "team_size": "solo|2-10|11+|unknown",
 "customer": "smb|consumer|dev|enterprise|creator|unknown",
 "price_band": "<10|10-49|50-249|250+|unknown  (손님이 내는 월 값, USD. 글에 값이 없으면 unknown)",
 "action_kind": "짧은 영어 소문자 snake_case 라벨(예: cold_email, twitter_build_in_public, seo_content, partner_referral, paid_ads_test, community_post)",
 "result_class": "positive|mixed|negative|none|unknown  (result 칸에 결과가 있으면 positive/mixed/negative, 결과 칸이 비었으면 none, 읽어도 알 수 없으면 unknown)",
 "result_ko": "결과 한 줄(한국어, 숫자·기간이 있으면 그대로, 200자 이내) 또는 null",
 "why_worked_ko": "먹힌(또는 안 먹힌) 이유 한 줄(한국어). 입력이 이유를 말하거나 분명히 보일 때만. 아니면 null",
 "condition_ko": "통하는 조건 한 줄(한국어). 입력에 근거가 있을 때만. 아니면 null",
 "evidence_strength": "A(숫자+기간이 있는 결과) | B(숫자 없는 구체 결과 또는 숫자만) | C(행동만, 결과 없음)",
 "basis": {"stage": "근거가 된 입력 칸 이름 또는 null", "team_size": "...", "customer": "...", "result": "...", "why_worked": "...", "condition": "..."}
}
basis 의 값은 move|result|blocked|who|quote|pattern|category 중 하나이거나 null 이다. 값을 unknown/null 로 둔 칸은 basis 도 null.
customer 는 이 회사의 "돈을 내는 손님"이다(창업자 본인·잠재 방문자가 아니다). 손님 종류가 move/result/blocked/who 에 직접 드러날 때만 채우고 분야(category) 칸만 보고 채우지 않는다.
stage/team_size/customer/price_band 는 입력에 직접 단서(예: "혼자", "팀 5명", "출시 전", "개발자 대상")가 있을 때만 채운다. 매출 숫자가 있어도 단계를 추정하지 않는다.`

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const textOf = (r) => `회사: ${r.company}\n분야: ${r.category ?? ''}\n누가(who): ${r.who ?? ''}\n막힌 점(blocked): ${r.blocked ?? ''}\n행동(move): ${r.move ?? ''}\n결과(result): ${r.result ?? ''}\n패턴(pattern): ${r.pattern ?? ''}\n원문 인용(quote, 출력 금지): ${r.quote ?? ''}`

async function tagOne(r) {
  const msg = await client.messages.create({ model: MODEL, max_tokens: 700, system: SYSTEM, output_config: { effort: 'low' }, messages: [{ role: 'user', content: textOf(r) }] })
  const raw = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
  const p = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}')
  const basis = typeof p.basis === 'object' && p.basis ? p.basis : {}
  const okBasis = (k) => FIELDS.includes(basis[k]) && String(r[basis[k]] ?? '').trim() !== ''
  const pick = (f, k) => (lockOk(f, p[f]) && (p[f] === 'unknown' || (okBasis(k ?? f) && !(f === 'customer' && basis.customer === 'category'))) ? p[f] : 'unknown')
  const clip = (s) => (typeof s === 'string' && s.trim() ? s.trim().slice(0, 200) : null)
  const tag = {
    move_id: r.id, chapter: LEVER_CHAPTER[r.lever] ?? '5',
    stage: pick('stage'), team_size: pick('team_size'), customer: pick('customer'), price_band: pick('price_band'),
    revenue_band: revBand(r.revenue_mo), action_kind: typeof p.action_kind === 'string' ? p.action_kind.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 60) || 'unknown' : 'unknown',
    result_class: lockOk('result_class', p.result_class) ? p.result_class : 'unknown',
    result_ko: okBasis('result') ? clip(p.result_ko) : null,
    why_worked_ko: okBasis('why_worked') ? clip(p.why_worked_ko) : null,
    condition_ko: okBasis('condition') ? clip(p.condition_ko) : null,
    evidence_strength: lockOk('evidence_strength', p.evidence_strength) ? p.evidence_strength : 'C',
    basis, label_model: MODEL, label_run: RUN,
  }
  // 결과 칸이 비었는데 모델이 positive/negative 를 말하면 none 으로 내린다(지어내기 방지).
  if (!String(r.result ?? '').trim() && ['positive', 'mixed', 'negative'].includes(tag.result_class)) { tag.result_class = 'none'; tag.result_ko = null }
  return { tag, inTok: msg.usage.input_tokens, outTok: msg.usage.output_tokens }
}

async function loadMoves() {
  const out = []
  for (let p = 0; ; p++) {
    const { data, error } = await sb.from('ss_moves').select('id, slug, move_idx, company, category, lever, who, blocked, move, result, pattern, quote, revenue_mo, source_url').in('lever', levers).order('id').range(p * 1000, p * 1000 + 999)
    if (error) { console.error(error.message); process.exit(2) }
    out.push(...data); if (data.length < 1000) break
  }
  return out
}

fs.mkdirSync('reports/2026-11-18', { recursive: true })
const LOCK = 'ops/state/ss-move-tag.lock'
if (!DRY) {
  if (fs.existsSync(LOCK)) { console.error('락 존재 — 중단'); process.exit(4) }
  fs.writeFileSync(LOCK, `${RUN} pid=${process.pid}\n`)
  const rel = () => { try { fs.unlinkSync(LOCK) } catch {} }
  process.on('exit', rel); process.on('SIGINT', () => { rel(); process.exit(130) })
}
let moves = await loadMoves()
if (SAMPLE) {
  // 모델 간 비교가 되도록 같은 표본: id 해시 정렬로 결정적 추출(결과 칸 있는 줄/없는 줄을 반반 섞는다).
  const h = (r) => crypto.createHash('md5').update(r.id + (arg('seed', 'v71cr'))).digest('hex')
  const sorted = [...moves].sort((a, b) => (h(a) < h(b) ? -1 : 1))
  const withRes = sorted.filter((r) => (r.result ?? '').trim()), noRes = sorted.filter((r) => !(r.result ?? '').trim())
  moves = [...withRes.slice(0, Math.ceil(SAMPLE / 2)), ...noRes.slice(0, Math.floor(SAMPLE / 2))]
} else if (!DRY) {
  const done = new Set()
  for (let p = 0; ; p++) {
    const { data, error } = await sb.from('ss_move_tags').select('move_id').eq('label_run', RUN).range(p * 1000, p * 1000 + 999)
    if (error) { console.error(error.message); process.exit(2) }
    for (const r of data) done.add(r.move_id); if (data.length < 1000) break
  }
  moves = moves.filter((r) => !done.has(r.id))
}
if (arg('limit')) moves = moves.slice(0, Number(arg('limit')))
console.log(`[ss-move-tag ${RUN}] 대상 ${moves.length} dry=${DRY} 장=${CHAPTERS}`)
const results = []; let inT = 0, outT = 0, err = 0, idx = 0, lastReport = 0, buf = []
const cost = () => (inT * P_IN + outT * P_OUT) / 1e6
async function flush() {
  if (DRY || !buf.length) return
  const { error } = await sb.from('ss_move_tags').upsert(buf, { onConflict: 'move_id,label_run', ignoreDuplicates: true })
  if (error) { console.error('적재 실패', error.message); process.exit(3) }
  buf = []
}
await Promise.all(Array.from({ length: CONC }, async () => {
  while (idx < moves.length) {
    const r = moves[idx++]
    try { const x = await tagOne(r); inT += x.inTok; outT += x.outTok; results.push({ ...x.tag, _id: r.id, _slug: r.slug, _lever: r.lever }); buf.push(x.tag); if (buf.length >= 100) await flush() } catch (e) { err++; if (err <= 5) console.error('오류', r.id, String(e?.message ?? e).slice(0, 100)) }
    if (results.length - lastReport >= 1000) { lastReport = results.length; console.log(`[ss-move-tag] ${results.length}건 누적 비용 $${cost().toFixed(3)}`) }
  }
}))
await flush()
const c = (f) => results.filter(f).length
const summary = { run: RUN, model: MODEL, n: results.length, err, cost_usd: Number(cost().toFixed(4)), per_row_usd: Number((cost() / Math.max(1, results.length)).toFixed(5)),
  stage_known: c((t) => t.stage !== 'unknown'), team_known: c((t) => t.team_size !== 'unknown'), customer_known: c((t) => t.customer !== 'unknown'), price_known: c((t) => t.price_band !== 'unknown'),
  result_positive: c((t) => t.result_class === 'positive'), result_mixed: c((t) => t.result_class === 'mixed'), result_negative: c((t) => t.result_class === 'negative'), result_none: c((t) => t.result_class === 'none'), result_unknown: c((t) => t.result_class === 'unknown'),
  why_filled: c((t) => t.why_worked_ko), cond_filled: c((t) => t.condition_ko), evA: c((t) => t.evidence_strength === 'A'), evB: c((t) => t.evidence_strength === 'B'), evC: c((t) => t.evidence_strength === 'C') }
console.log(JSON.stringify(summary))
if (SAMPLE || DRY) fs.writeFileSync(`reports/2026-11-18/tag-test-${TAG}.json`, JSON.stringify({ summary, rows: results }, null, 1))
