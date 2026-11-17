#!/usr/bin/env node
// v71cr §2: 규칙(rule-no-description)이 일괄로 '낮음'을 찍은 failure_ledger·ss_moves 줄을, 실제 글(lesson/cause, move/result/quote)을 입력으로 다시 라벨한다.
// 추가 전용: 기존 case_bank_labels 는 건드리지 않고 case_bank_label_revisions(20261118000001)에만 INSERT. 같은 (case_id,label_run)은 건너뛴다.
// 사용: node --env-file=.env.local scripts/case-bank-relabel.mjs --source failure_ledger --limit 50 --dry   (dry = DB 쓰기 0)
//       node --env-file=.env.local scripts/case-bank-relabel.mjs --source ss_moves --concurrency 4            (전체, 이어하기 가능)
import fs from 'node:fs'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { UNTRUSTED_INPUT_NOTICE } from '../lib/llm/untrusted-input.ts'

const arg = (k, d = null) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d }
const SOURCE = arg('source')
const LIMIT = arg('limit') ? Number(arg('limit')) : null
const CONCURRENCY = Number(arg('concurrency', 4))
const DRY = process.argv.includes('--dry')
const MODEL = 'claude-haiku-5-5'
const PRICE_IN = 0.8, PRICE_OUT = 4
const RUN = `v71cr_${SOURCE}_relabel_20261118`

const LOCK = 'ops/state/case-bank-relabel.lock'
if (fs.existsSync(LOCK)) { console.error(`락 존재(${LOCK}) — 중단`); process.exit(4) }
fs.writeFileSync(LOCK, `${SOURCE} pid=${process.pid}\n`)
const rel = () => { try { fs.unlinkSync(LOCK) } catch {} }
process.on('exit', rel); process.on('SIGINT', () => { rel(); process.exit(130) })

const DEFS = {
  failure_ledger: {
    pk: 'id', caseId: (r) => `failure_ledger:${r.id}`,
    select: 'id, company, category, closed_year, founded_year, funding_usd, cause_primary, lesson_one_line, evidence_grade',
    textOf: (r) => `회사: ${r.company ?? ''}\n분야: ${r.category ?? ''}\n설립: ${r.founded_year ?? ''} / 폐업: ${r.closed_year ?? ''}\n누적 투자(USD): ${r.funding_usd ?? ''}\n실패 원인(주): ${r.cause_primary ?? ''}\n교훈 한 줄: ${r.lesson_one_line ?? ''}`,
    quoteField: (r) => r.lesson_one_line,
    note: '이 표는 폐업·실패 기록 대장이다. 입력의 "폐업 연도"·"실패 원인"이 있으면 outcome=failure 로 본다(없으면 unknown). 사업 설명은 따로 없으므로 domain 은 분야·교훈에서 근거가 보일 때만 고른다.',
  },
  ss_moves: {
    pk: 'id', caseId: (r) => `ss_moves:${r.slug}:${r.move_idx}`,
    select: 'id, slug, move_idx, company, category, revenue_mo, move, result, lever, quote',
    textOf: (r) => `회사: ${r.company ?? ''}\n분야: ${r.category ?? ''}\n월매출(USD): ${r.revenue_mo ?? ''}\n한 일(move): ${r.move ?? ''}\n결과(result): ${r.result ?? ''}\n레버: ${r.lever ?? ''}\n원문 인용: ${r.quote ?? ''}`,
    quoteField: (r) => r.quote || r.move,
    note: '이 표는 성장 사례(무엇을 해서 어떤 결과가 났나) 기록이다. outcome 은 결과(result)나 월매출이 성공을 뒷받침할 때만 success, 아니면 unknown. 인용(quote)이 있으면 evidence_quote 는 그 문장에서 가져온다.',
  },
}
const def = DEFS[SOURCE]
if (!def) { console.error('--source failure_ledger | ss_moves'); process.exit(1) }

const ENUMS = {
  domain: ['hr_attendance','payments_billing_accounting','booking_scheduling_forms','marketing_automation','sales_crm','nocode_automation','analytics','devtools_infra','content_creator_tools','ecommerce_seller_tools','other_saas','not_saas','unknown'],
  segment: ['P','S','M','E','unknown'], buyer_type: ['smb_owner','team_lead','enterprise','consumer','dev','unknown'],
  channel_main: ['organic_seo','social','word_of_mouth','direct_sales','partnership','paid_ads','marketplace','community','unknown'],
  pricing_model: ['subscription','usage','one_time','freemium','free','unknown'], price_band_usd_mo: ['<10','10-49','50-249','250-999','1000+','unknown'],
  revenue_band: ['<1k','1-5k','5-10k','10-50k','50-100k','100-500k','500k+','unknown'], stage_at_snapshot: ['prelaunch','first10','mrr_1_10k','mrr_10_100k','scaling','unknown'],
  outcome: ['success','failure','acquired','zombie','unknown'], fit_broken: ['0','1','2','3','4','none','unknown'], confidence: ['high','mid','low'],
}
const clamp = (f, v, d) => (ENUMS[f].includes(v) ? v : d)
const STATUS_WORD = /^(acquired|inactive|active|closed|dead|shut\s*down|zombie|현재\s*상태|폐업|인수|종료|운영\s*중)\.?$/i

const SYSTEM = `당신은 스타트업 사례 1건을 아래 스키마로 라벨링하는 분류기다. 근거 없으면 반드시 "unknown". 추정 금지.
${UNTRUSTED_INPUT_NOTICE}
${def.note}
domain: ${ENUMS.domain.join(' | ')}
segment: P(월 $50 미만 프로슈머) | S(ACV<$12K) | M($12K~100K) | E(>$100K) | unknown
buyer_type: ${ENUMS.buyer_type.join(' | ')}
channel_main: ${ENUMS.channel_main.join(' | ')}
pricing_model: ${ENUMS.pricing_model.join(' | ')}
price_band_usd_mo: ${ENUMS.price_band_usd_mo.join(' | ')}
revenue_band: ${ENUMS.revenue_band.join(' | ')}
stage_at_snapshot: ${ENUMS.stage_at_snapshot.join(' | ')}
outcome: success | failure | acquired | zombie | unknown
failure_mode: 실패/좀비일 때만 F1~F13 중 하나(모르면 "unknown"), 아니면 "none"
fit_broken: 실패/좀비일 때만 가장 앞에서 끊긴 단계 0~4(모르면 "unknown"), 아니면 "none"
kill_flags: 배열, 해당 없으면 []
evidence_quote: 입력 줄에서 그대로 가져온 문장 1개, 130자 이내. 상태·결과 단어 자체("Acquired","폐업" 등)는 금지. 쓸 문장이 없으면 null.
confidence: high(근거 문장이 분명하고 필드가 대부분 근거로 채워짐) | mid | low
반드시 JSON 객체 하나만 출력. 설명 문장 금지.`

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

async function labelOne(row) {
  const msg = await client.messages.create({ model: MODEL, max_tokens: 600, system: SYSTEM, output_config: { effort: 'low' }, messages: [{ role: 'user', content: def.textOf(row) }] })
  const raw = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
  const p = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}')
  let quote = typeof p.evidence_quote === 'string' ? p.evidence_quote.trim().slice(0, 130) : null
  if (!quote || STATUS_WORD.test(quote)) quote = null
  // 모델이 지어낸 인용 방지: 입력 줄에 실제로 들어 있는 문장 조각이어야 한다.
  const hay = def.textOf(row)
  if (quote && !hay.includes(quote.slice(0, Math.min(quote.length, 40)))) quote = null
  const label = {
    case_id: def.caseId(row), source: SOURCE,
    domain: quote ? clamp('domain', p.domain, 'unknown') : (SOURCE === 'ss_moves' ? clamp('domain', p.domain, 'unknown') : 'unknown'),
    segment: clamp('segment', p.segment, 'unknown'), buyer_type: clamp('buyer_type', p.buyer_type, 'unknown'),
    channel_main: clamp('channel_main', p.channel_main, 'unknown'), pricing_model: clamp('pricing_model', p.pricing_model, 'unknown'),
    price_band_usd_mo: clamp('price_band_usd_mo', p.price_band_usd_mo, 'unknown'), revenue_band: clamp('revenue_band', p.revenue_band, 'unknown'),
    stage_at_snapshot: clamp('stage_at_snapshot', p.stage_at_snapshot, 'unknown'), outcome: clamp('outcome', p.outcome, 'unknown'),
    failure_mode: typeof p.failure_mode === 'string' ? p.failure_mode : 'none', fit_broken: clamp('fit_broken', p.fit_broken, 'none'),
    kill_flags: Array.isArray(p.kill_flags) ? p.kill_flags : [], evidence_quote: quote,
    confidence: quote ? clamp('confidence', p.confidence, 'low') : 'low', label_model: MODEL, label_run: RUN,
  }
  return { label, inTok: msg.usage.input_tokens, outTok: msg.usage.output_tokens }
}

async function main() {
  // 대상 = 기존 라벨이 rule-no-description 인 case_id, 이미 이번 run 에 개정된 건 제외.
  const base = new Map()
  for (let p = 0; ; p++) {
    const { data, error } = await sb.from('case_bank_labels').select('case_id').eq('source', SOURCE).eq('label_model', 'rule-no-description').range(p * 1000, p * 1000 + 999)
    if (error) { console.error(error.message); process.exit(2) }
    for (const r of data) base.set(r.case_id, true)
    if (data.length < 1000) break
  }
  const done = new Set()
  for (let p = 0; ; p++) {
    const { data, error } = await sb.from('case_bank_label_revisions').select('case_id').eq('label_run', RUN).range(p * 1000, p * 1000 + 999)
    if (error) { console.error(error.message); process.exit(2) }
    for (const r of data) done.add(r.case_id)
    if (data.length < 1000) break
  }
  console.log(`[relabel:${SOURCE}] 대상 ${base.size} · 이미 개정 ${done.size} · dry=${DRY}`)
  const out = []; let inT = 0, outT = 0, err = 0, seen = 0
  for (let p = 0; ; p++) {
    const { data: rows, error } = await sb.from(SOURCE).select(def.select).order(def.pk).range(p * 500, p * 500 + 499)
    if (error) { console.error(error.message); process.exit(2) }
    if (!rows.length) break
    let targets = rows.filter((r) => base.has(def.caseId(r)) && !done.has(def.caseId(r)))
    if (LIMIT) targets = targets.slice(0, Math.max(0, LIMIT - seen))
    let idx = 0
    const batch = []
    await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
      while (idx < targets.length) {
        const r = targets[idx++]
        try { const res = await labelOne(r); inT += res.inTok; outT += res.outTok; batch.push(res.label) } catch (e) { err++; console.error('오류', def.caseId(r), String(e?.message ?? e).slice(0, 120)) }
      }
    }))
    seen += targets.length
    if (!DRY && batch.length) {
      const { error: ie } = await sb.from('case_bank_label_revisions').upsert(batch, { onConflict: 'case_id,label_run', ignoreDuplicates: true })
      if (ie) { console.error('적재 실패', ie.message); process.exit(3) }
    }
    out.push(...batch)
    console.log(`[relabel:${SOURCE}] 처리 ${seen} 성공 ${out.length} 오류 ${err} 비용 $${((inT * PRICE_IN + outT * PRICE_OUT) / 1e6).toFixed(4)}`)
    if (LIMIT && seen >= LIMIT) break
  }
  const c = (f) => out.filter(f).length
  console.log(JSON.stringify({ source: SOURCE, run: RUN, dry: DRY, n: out.length, low: c((l) => l.confidence === 'low'), mid: c((l) => l.confidence === 'mid'), high: c((l) => l.confidence === 'high'), quote: c((l) => l.evidence_quote), outcome_unknown: c((l) => l.outcome === 'unknown'), domain_unknown: c((l) => l.domain === 'unknown'), cost_usd: Number(((inT * PRICE_IN + outT * PRICE_OUT) / 1e6).toFixed(4)) }))
  if (DRY) fs.writeFileSync(`reports/2026-11-18/relabel-dry-${SOURCE}.json`, JSON.stringify(out, null, 1))
}
fs.mkdirSync('reports/2026-11-18', { recursive: true })
await main()
