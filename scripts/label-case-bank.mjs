#!/usr/bin/env node
// v71ck C-1/C-2: 사례 은행 통합 라벨링(domain/segment/outcome 등) → case_bank_labels.
// DB에서 페이지 단위로 읽어 바로 라벨링·적재(대량 메모리 로드 없음), 동시 호출 N개, 체크포인트 단위로 저장·해제.
// 2026-11-13 남헌 지시: 동시 실행 금지(락파일) · 묶음을 작게(기본 200) · 묶음마다 메모리 로그 · 한계 근접 시 스스로 멈춤.
// 사용(별도 터미널에서): node --env-file=.env.local scripts/label-case-bank.mjs --source yc_companies --concurrency 4 --chunk 200 [--limit 50]
import fs from 'node:fs'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { UNTRUSTED_INPUT_NOTICE } from '../lib/llm/untrusted-input.ts'

const arg = (k, d = null) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : d }
const SOURCE = arg('source')
const CONCURRENCY = Number(arg('concurrency', 4))
const CHUNK = Number(arg('chunk', 200))
const LIMIT = arg('limit') ? Number(arg('limit')) : null
const MODEL = 'claude-haiku-5-5'
const PRICE_IN = 0.8, PRICE_OUT = 4 // $/M tokens, lib/consult/cost.ts PRICE_PER_M.haiku
const MEM_LIMIT_MB = Number(arg('mem-limit-mb', 1200))

// 동시 실행 금지 — 같은 디렉토리에서 두 번째 라벨링 프로세스가 뜨면 즉시 멈춘다(지시 §3).
const LOCK_PATH = 'ops/state/label-case-bank.lock'
if (fs.existsSync(LOCK_PATH)) {
  console.error(`[label-case-bank] 락 파일 존재(${LOCK_PATH}) — 다른 라벨링 작업이 이미 돌고 있다고 보고 즉시 종료한다. 끝났는데 남아 있으면 지우고 재실행.`)
  process.exit(4)
}
fs.writeFileSync(LOCK_PATH, `${SOURCE} pid=${process.pid} started=${new Date().toISOString()}\n`)
const releaseLock = () => { try { fs.unlinkSync(LOCK_PATH) } catch {} }
process.on('exit', releaseLock)
process.on('SIGINT', () => { releaseLock(); process.exit(130) })
process.on('SIGTERM', () => { releaseLock(); process.exit(143) })

// 2026-11-14 남헌 지시: evidence_quote 는 "사업 설명 문장"만 — 상태·결과 문구(Acquired/Inactive/폐업 등) 금지.
// failure_ledger·ss_moves 는 애초에 "사업 설명" 컬럼이 아예 없다(실패 원인·동작 기록용 스키마) — 사업 설명이 없으므로
// hasDescription:false 로 두고 LLM 을 부르지 않는다(비용도 아낀다). domain=unknown·evidence_quote=null 로 적재해
// "설명 문장이 없는 행은 unknown + 라벨링 대상 제외"를 그대로 따른다. 나중에 category 기반 별도 보강은 사람 판단.
const SOURCE_DEFS = {
  yc_companies: {
    table: 'yc_companies', pk: 'yc_id', hasDescription: true,
    caseId: (r) => `yc_companies:${r.slug}`,
    displayName: (r) => r.name,
    url: (r) => r.website ?? r.source_url ?? null,
    select: 'yc_id, slug, name, website, source_url, one_liner, industry, subindustry, tags, team_size, location, launched_year, status, batch',
    toText: (r) => `사업 설명: ${r.one_liner ?? ''}\n업종: ${r.industry ?? ''} / ${r.subindustry ?? ''}\n태그: ${(r.tags ?? []).join(', ')}`,
  },
  ss_businesses: {
    table: 'ss_businesses', pk: 'id', hasDescription: true,
    caseId: (r) => `ss_business:${r.source_key ?? r.id}`,
    displayName: (r) => r.name,
    url: (r) => r.website ?? null,
    select: 'id, source_key, name, website, one_liner, category, est_monthly_revenue_num, founded_year, monetization_models, growth_channels, key_facts',
    toText: (r) => `사업 설명: ${r.one_liner ?? ''}\n분야: ${r.category ?? ''}\n과금방식: ${JSON.stringify(r.monetization_models ?? [])}\n성장채널: ${JSON.stringify(r.growth_channels ?? [])}`,
  },
  failure_ledger: {
    table: 'failure_ledger', pk: 'id', hasDescription: false,
    caseId: (r) => `failure_ledger:${r.id}`,
    displayName: (r) => r.company,
    url: (r) => r.url ?? r.evidence_url ?? null,
    select: 'id, company, category, url, evidence_url',
  },
  idea_bank: {
    table: 'idea_bank', pk: 'id', hasDescription: true,
    caseId: (r) => `idea_bank:${r.id}`,
    displayName: (r) => r.title,
    url: (r) => r.website ?? null,
    select: 'id, title, summary, website, category, revenue_mo, started, location, founders_count, tags',
    toText: (r) => `사업 설명: ${r.summary ?? ''}\n분야(원문): ${r.category ?? ''}\n태그: ${(r.tags ?? []).join(', ')}`,
  },
  ss_moves: {
    table: 'ss_moves', pk: 'id', hasDescription: false,
    caseId: (r) => `ss_moves:${r.slug}:${r.move_idx}`,
    displayName: (r) => r.company,
    url: (r) => r.source_url ?? null,
    select: 'id, slug, move_idx, company, category, source_url',
  },
}

/** 모델이 지어내는 게 아니라 원문에 실제로 있던 상태·결과 단어를 평가문처럼 돌려주는 사고를 막는다(2026-11-14 실측). */
const STATUS_WORD = /^(acquired|inactive|active|closed|dead|shut\s*down|zombie|현재\s*상태|폐업|인수|종료|운영\s*중)\.?$/i
function sanitizeEvidenceQuote(q) {
  if (!q) return null
  const trimmed = String(q).trim()
  if (!trimmed || STATUS_WORD.test(trimmed)) return null
  return trimmed.slice(0, 130)
}

const def = SOURCE_DEFS[SOURCE]
if (!def) { console.error(`--source 필요: ${Object.keys(SOURCE_DEFS).join(' | ')}`); process.exit(1) }

const SYSTEM = `당신은 스타트업 사례 1건을 아래 스키마로 라벨링하는 분류기다. 근거 없으면 반드시 "unknown". 추정 금지.
${UNTRUSTED_INPUT_NOTICE}
domain: hr_attendance | payments_billing_accounting | booking_scheduling_forms | email_marketing_automation | sales_crm | nocode_automation | analytics | devtools_infra | content_creator_tools | ecommerce_seller_tools | other_saas | not_saas
not_saas 판단 규칙(2026-11-14 남헌 결정):
- 고객이 받는 게 "소프트웨어 사용권"이 아니라 "사람이 만든 결과물"이면 서비스업이다. 대행사·프리랜서·세팅 대행(이메일·SMS 마케팅 대행 등)은 영역(domain)과 무관하게 not_saas.
- 교육 브랜드(강의·뉴스레터형 교육 사업)도 not_saas.
- 미디어 브랜드(뉴스레터 등 콘텐츠 사업)는 not_saas로 내리지 말고 content_creator_tools 같은 콘텐츠 영역 태그를 그대로 인정한다.
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
evidence_quote: "사업 설명" 줄에서 그대로 가져온 문장 1개만, 130자 이내. "Acquired"·"Inactive"·"폐업" 같은 상태·결과 단어 그 자체는 절대 evidence_quote 로 쓰지 않는다(그건 outcome 필드로 가야 할 값이다) — 사업 설명 문장이 없거나 비어 있으면 null.
confidence: high | mid | low
반드시 JSON 객체 하나만 출력. 설명 문장 금지.`

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// DB check 제약과 같은 값 집합. 모델이 목록 밖 값(자유 텍스트)을 내면 unknown/none으로 떨어뜨린다 — 추정 금지 원칙과 같은 방향.
const ENUMS = {
  domain: new Set(['hr_attendance', 'payments_billing_accounting', 'booking_scheduling_forms', 'email_marketing_automation', 'sales_crm', 'nocode_automation', 'analytics', 'devtools_infra', 'content_creator_tools', 'ecommerce_seller_tools', 'other_saas', 'not_saas', 'unknown']),
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

/** 사업 설명 자체가 없는 소스(failure_ledger·ss_moves)는 LLM 을 부르지 않고 unknown 으로 적재한다 — 비용 0, 지어낼 거리도 0. */
function noDescriptionLabel(row) {
  return { case_id: def.caseId(row), source: SOURCE, domain: 'unknown', segment: 'unknown', buyer_type: 'unknown', channel_main: 'unknown', pricing_model: 'unknown', price_band_usd_mo: 'unknown', revenue_band: 'unknown', stage_at_snapshot: 'unknown', outcome: 'unknown', failure_mode: 'none', fit_broken: 'none', kill_flags: [], evidence_quote: null, confidence: 'low', label_model: 'rule-no-description', label_run: `v71ck_${SOURCE}_no_description` }
}

async function labelOne(row) {
  if (!def.hasDescription) return { label: noDescriptionLabel(row), inTok: 0, outTok: 0 }
  const caseId = def.caseId(row)
  const text = def.toText(row)
  const msg = await client.messages.create({
    model: MODEL, max_tokens: 600, system: SYSTEM, output_config: { effort: 'low' },
    messages: [{ role: 'user', content: text }],
  })
  const raw = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
  const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}')
  // 2026-11-14: 상태·결과 단어를 evidence_quote 로 잘못 가져온 경우(사고 실측) null 로 걸러내고, 그러면 domain 도
  // "근거 없이 지어낸 분류"가 되므로 unknown 으로 같이 내린다 — 추정 금지 원칙을 quote 가 없을 때도 지킨다.
  const quote = sanitizeEvidenceQuote(parsed.evidence_quote)
  const label = {
    case_id: caseId, source: SOURCE,
    domain: quote ? clamp('domain', parsed.domain, 'unknown') : 'unknown',
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
    evidence_quote: quote,
    confidence: quote ? clamp('confidence', parsed.confidence, 'low') : 'low',
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
  // 2026-11-14 실측: PostgREST 기본 1000행 상한에 걸려 "이미 라벨됨"을 과소 집계하는 버그가 있었다
  // (idea_bank 실제 1963건인데 1000으로 보고됨) — 끝까지 페이지네이션해서 전부 가져온다.
  const done = new Set()
  for (let p = 0; ; p++) {
    const { data: existing, error: exErr } = await sb.from('case_bank_labels').select('case_id').eq('source', SOURCE).range(p * 1000, p * 1000 + 999)
    if (exErr) { console.error('기존 라벨 조회 실패:', exErr.message); process.exit(2) }
    for (const r of existing ?? []) done.add(r.case_id)
    if (!existing || existing.length < 1000) break
  }
  console.log(`[label-case-bank:${SOURCE}] 이미 라벨됨 ${done.size}`)

  // 2026-11-13: DB 읽기 묶음을 CHUNK 와 같은 크기로 맞춰 "작게 읽고 처리하고 해제"가 되게 한다(지시 §3).
  const PAGE = CHUNK
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
      const rssMb = Math.round(process.memoryUsage().rss / 1024 / 1024)
      console.log(`[label-case-bank:${SOURCE}] 처리 ${grandTotal} 성공 ${totalCases} 오류 ${totalErr} 이번청크비용 $${chunkCost} 누적비용 $${totalCost.toFixed(5)} 메모리 ${rssMb}MB`)
      if (rssMb >= MEM_LIMIT_MB) {
        console.error(`[label-case-bank:${SOURCE}] 메모리 한계(${MEM_LIMIT_MB}MB) 근접(${rssMb}MB) — 스스로 멈춘다. 체크포인트는 이미 저장됐으니 재실행하면 이어서 간다.`)
        releaseLock(); process.exit(5)
      }
    }
    if (LIMIT && grandTotal >= LIMIT) break
  }
  console.log(`[label-case-bank:${SOURCE}] 완료 처리 ${grandTotal} 성공 ${totalCases} 오류 ${totalErr} 누적비용 $${totalCost.toFixed(5)}`)
}

await main()
