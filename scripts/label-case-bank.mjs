#!/usr/bin/env node
// v71ck C-1/C-2: 사례 은행 통합 라벨링(domain/segment/outcome 등) → case_bank_labels.
// DB에서 페이지 단위로 읽어 바로 라벨링·적재(대량 메모리 로드 없음), 동시 호출 N개, 500건 단위 체크포인트.
// 사용(별도 터미널에서): node --env-file=.env.local scripts/label-case-bank.mjs --source yc_companies --concurrency 4 --chunk 500 [--limit 50]
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const arg = (k, d = null) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d }
const SOURCE = arg('source')
const CONCURRENCY = Number(arg('concurrency', 4))
const CHUNK = Number(arg('chunk', 500))
const LIMIT = arg('limit') ? Number(arg('limit')) : null
const MODEL = 'claude-haiku-5-5'
const PRICE_IN = 0.8, PRICE_OUT = 4 // $/M tokens, lib/consult/cost.ts PRICE_PER_M.haiku

const SOURCE_DEFS = {
  yc_companies: {
    table: 'yc_companies', pk: 'yc_id',
    caseId: (r) => `yc_companies:${r.slug}`,
    select: 'yc_id, slug, name, one_liner, industry, subindustry, tags, team_size, location, launched_year, status, batch',
    toText: (r) => `회사: ${r.name}\n한 줄 설명: ${r.one_liner ?? ''}\n업종: ${r.industry ?? ''} / ${r.subindustry ?? ''}\n태그: ${(r.tags ?? []).join(', ')}\n팀 규모: ${r.team_size ?? '?'}\n위치: ${r.location ?? ''}\n런칭연도: ${r.launched_year ?? '?'}\nYC 배치: ${r.batch ?? ''}\n현재 상태(YC 원문): ${r.status ?? ''}`,
  },
  ss_businesses: {
    table: 'ss_businesses', pk: 'id',
    caseId: (r) => `ss_business:${r.source_key ?? r.id}`,
    select: 'id, source_key, name, one_liner, category, est_monthly_revenue_num, founded_year, monetization_models, growth_channels, key_facts',
    toText: (r) => `회사: ${r.name}\n한 줄 설명: ${r.one_liner ?? ''}\n분야: ${r.category ?? ''}\n월매출(추정): ${r.est_monthly_revenue_num ?? '?'}\n설립연도: ${r.founded_year ?? '?'}\n과금방식: ${JSON.stringify(r.monetization_models ?? [])}\n성장채널: ${JSON.stringify(r.growth_channels ?? [])}\n핵심 사실: ${JSON.stringify(r.key_facts ?? {})}`,
  },
  failure_ledger: {
    table: 'failure_ledger', pk: 'id',
    caseId: (r) => `failure_ledger:${r.id}`,
    select: 'id, company, category, country, founded_year, closed_year, cause_primary, cause_tags, mechanism_tags, lesson_one_line, funding_usd, extra, evidence_url',
    toText: (r) => `회사: ${r.company}\n분야(원문): ${r.category ?? ''}\n국가: ${r.country ?? ''}\n설립~폐업: ${r.founded_year ?? '?'}~${r.closed_year ?? '?'}\n원인(기존): ${r.cause_primary ?? ''}\n원인 태그: ${r.cause_tags ?? ''}\n메커니즘: ${(r.mechanism_tags ?? []).join(', ')}\n교훈 한줄(기존): ${r.lesson_one_line ?? ''}\n투자금: ${r.funding_usd ?? '?'}\n추가정보: ${JSON.stringify(r.extra ?? {}).slice(0, 2000)}`,
  },
  idea_bank: {
    table: 'idea_bank', pk: 'id',
    caseId: (r) => `idea_bank:${r.id}`,
    select: 'id, title, summary, category, revenue_mo, started, location, founders_count, tags, mechanism_tags, metrics',
    toText: (r) => `제목: ${r.title ?? ''}\n요약: ${r.summary ?? ''}\n분야(원문): ${r.category ?? ''}\n월매출: ${r.revenue_mo ?? '?'}\n시작: ${r.started ?? ''}\n위치: ${r.location ?? ''}\n창업자 수: ${r.founders_count ?? '?'}\n태그: ${(r.tags ?? []).join(', ')}\n메커니즘: ${(r.mechanism_tags ?? []).join(', ')}\n지표: ${JSON.stringify(r.metrics ?? {})}`,
  },
  ss_moves: {
    table: 'ss_moves', pk: 'id',
    caseId: (r) => `ss_moves:${r.slug}:${r.move_idx}`,
    select: 'id, slug, move_idx, company, category, revenue_mo, who, blocked, move, result, lever, pattern, quote',
    toText: (r) => `회사: ${r.company}\n분야(원문): ${r.category ?? ''}\n월매출: ${r.revenue_mo ?? '?'}\n누가 무엇을 못 했나: ${r.who ?? ''} / ${r.blocked ?? ''}\n한 동작: ${r.move ?? ''}\n결과: ${r.result ?? ''}\n레버(기존 라벨): ${r.lever ?? ''}\n패턴: ${r.pattern ?? ''}\n근거 문장: ${r.quote ?? ''}`,
  },
}

const def = SOURCE_DEFS[SOURCE]
if (!def) { console.error(`--source 필요: ${Object.keys(SOURCE_DEFS).join(' | ')}`); process.exit(1) }

const SYSTEM = `당신은 스타트업 사례 1건을 아래 스키마로 라벨링하는 분류기다. 근거 없으면 반드시 "unknown". 추정 금지.
domain: hr_attendance | payments_billing_accounting | booking_scheduling_forms | email_marketing_automation | sales_crm | nocode_automation | analytics | devtools_infra | content_creator_tools | ecommerce_seller_tools | other_saas | not_saas
segment: P(월 $50 미만 프로슈머) | S(ACV<$12K) | M($12K~100K) | E(>$100K) | unknown
buyer_type: smb_owner | team_lead | enterprise | consumer | dev | unknown
channel_main: organic_seo | social | word_of_mouth | direct_sales | partnership | paid_ads | marketplace | community | unknown
pricing_model: subscription | usage | one_time | freemium | free | unknown
price_band_usd_mo: <10 | 10-49 | 50-249 | 250-999 | 1000+ | unknown
revenue_band: <1k | 1-5k | 5-10k | 10-50k | 50-100k | 100-500k | 500k+ | unknown
stage_at_snapshot: prelaunch | first10 | mrr_1_10k | mrr_10_100k | scaling | unknown
outcome: success | failure | acquired | zombie | unknown
failure_mode: 실패/좀비일 때만 F1~F13 중 하나(모르면 "unknown"), 아니면 "none"
fit_broken: 실패/좀비일 때만 가장 앞에서 끊긴 단계 0~4(모르면 "unknown"), 아니면 "none"
kill_flags: 배열, 해당 없으면 []
evidence_quote: 입력 원문에서 그대로 가져온 근거 문장 1개, 130자 이내, 근거 없으면 null
confidence: high | mid | low
반드시 JSON 객체 하나만 출력. 설명 문장 금지.`

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// DB check 제약과 같은 값 집합. 모델이 목록 밖 값(자유 텍스트)을 내면 unknown/none으로 떨어뜨린다 — 추정 금지 원칙과 같은 방향.
const ENUMS = {
  domain: new Set(['hr_attendance', 'payments_billing_accounting', 'booking_scheduling_forms', 'email_marketing_automation', 'sales_crm', 'nocode_automation', 'analytics', 'devtools_infra', 'content_creator_tools', 'ecommerce_seller_tools', 'other_saas', 'not_saas']),
  segment: new Set(['P', 'S', 'M', 'E', 'unknown']),
  buyer_type: new Set(['smb_owner', 'team_lead', 'enterprise', 'consumer', 'dev', 'unknown']),
  channel_main: new Set(['organic_seo', 'social', 'word_of_mouth', 'direct_sales', 'partnership', 'paid_ads', 'marketplace', 'community', 'unknown']),
  pricing_model: new Set(['subscription', 'usage', 'one_time', 'freemium', 'free', 'unknown']),
  price_band_usd_mo: new Set(['<10', '10-49', '50-249', '250-999', '1000+', 'unknown']),
  revenue_band: new Set(['<1k', '1-5k', '5-10k', '10-50k', '50-100k', '100-500k', '500k+', 'unknown']),
  stage_at_snapshot: new Set(['prelaunch', 'first10', 'mrr_1_10k', 'mrr_10_100k', 'scaling', 'unknown']),
  outcome: new Set(['success', 'failure', 'acquired', 'zombie', 'unknown']),
  fit_broken: new Set(['0', '1', '2', '3', '4', 'none', 'unknown']),
  confidence: new Set(['high', 'mid', 'low']),
}
const clamp = (field, value, fallback) => (ENUMS[field]?.has(value) ? value : fallback)

async function labelOne(row) {
  const caseId = def.caseId(row)
  const text = def.toText(row)
  const msg = await client.messages.create({
    model: MODEL, max_tokens: 600, system: SYSTEM, output_config: { effort: 'low' },
    messages: [{ role: 'user', content: text }],
  })
  const raw = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
  const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}')
  const label = {
    case_id: caseId, source: SOURCE,
    domain: clamp('domain', parsed.domain, 'other_saas'),
    segment: clamp('segment', parsed.segment, 'unknown'),
    buyer_type: clamp('buyer_type', parsed.buyer_type, 'unknown'),
    channel_main: clamp('channel_main', parsed.channel_main, 'unknown'),
    pricing_model: clamp('pricing_model', parsed.pricing_model, 'unknown'),
    price_band_usd_mo: clamp('price_band_usd_mo', parsed.price_band_usd_mo, 'unknown'),
    revenue_band: clamp('revenue_band', parsed.revenue_band, 'unknown'),
    stage_at_snapshot: clamp('stage_at_snapshot', parsed.stage_at_snapshot, 'unknown'),
    outcome: clamp('outcome', parsed.outcome, 'unknown'),
    failure_mode: typeof parsed.failure_mode === 'string' ? parsed.failure_mode : 'none',
    fit_broken: clamp('fit_broken', parsed.fit_broken, 'none'),
    kill_flags: Array.isArray(parsed.kill_flags) ? parsed.kill_flags : [],
    evidence_quote: parsed.evidence_quote ? String(parsed.evidence_quote).slice(0, 130) : null,
    confidence: clamp('confidence', parsed.confidence, 'low'),
    label_model: MODEL, label_run: `v71ck_${SOURCE}_${new Date().toISOString().slice(0, 10)}`,
  }
  return { label, inTok: msg.usage.input_tokens, outTok: msg.usage.output_tokens }
}

async function runPool(rows, onDone) {
  let idx = 0
  async function worker() {
    while (idx < rows.length) {
      const r = rows[idx++]
      try { onDone(r, await labelOne(r), null) } catch (e) { onDone(r, null, e) }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))
}

async function main() {
  const { data: existing, error: exErr } = await sb.from('case_bank_labels').select('case_id').eq('source', SOURCE)
  if (exErr) { console.error('기존 라벨 조회 실패:', exErr.message); process.exit(2) }
  const done = new Set((existing ?? []).map((r) => r.case_id))
  console.log(`[label-case-bank:${SOURCE}] 이미 라벨됨 ${done.size}`)

  const PAGE = 1000
  let page = 0, totalCases = 0, totalCost = 0, totalErr = 0, grandTotal = 0
  while (true) {
    const { data: rows, error } = await sb.from(def.table).select(def.select).range(page * PAGE, page * PAGE + PAGE - 1)
    if (error) { console.error('조회 실패:', error.message); process.exit(2) }
    if (!rows || rows.length === 0) break
    page++
    const targets = rows.filter((r) => !done.has(def.caseId(r)))
    if (LIMIT) { /* limit은 아래 전체 카운터로 적용 */ }

    for (let i = 0; i < targets.length; i += CHUNK) {
      if (LIMIT && grandTotal >= LIMIT) break
      const chunk = targets.slice(i, i + CHUNK).slice(0, LIMIT ? Math.max(0, LIMIT - grandTotal) : undefined)
      const toUpsert = []
      let chunkIn = 0, chunkOut = 0, chunkErr = 0
      await runPool(chunk, (r, res, err) => {
        if (err) { chunkErr++; console.error('[label-case-bank] 오류', def.caseId(r), String(err?.message ?? err)); return }
        chunkIn += res.inTok; chunkOut += res.outTok
        toUpsert.push(res.label)
      })
      if (toUpsert.length) {
        const { error: upErr } = await sb.from('case_bank_labels').upsert(toUpsert, { onConflict: 'case_id' })
        if (upErr) console.error('[label-case-bank] 적재 실패:', upErr.message)
      }
      const chunkCost = Math.round(((chunkIn * PRICE_IN + chunkOut * PRICE_OUT) / 1_000_000) * 100000) / 100000
      totalCases += toUpsert.length; totalCost += chunkCost; totalErr += chunkErr; grandTotal += chunk.length
      console.log(`[label-case-bank:${SOURCE}] 처리 ${grandTotal} 성공 ${totalCases} 오류 ${totalErr} 이번청크비용 $${chunkCost} 누적비용 $${totalCost.toFixed(5)}`)
    }
    if (LIMIT && grandTotal >= LIMIT) break
  }
  console.log(`[label-case-bank:${SOURCE}] 완료 처리 ${grandTotal} 성공 ${totalCases} 오류 ${totalErr} 누적비용 $${totalCost.toFixed(5)}`)
}

await main()
