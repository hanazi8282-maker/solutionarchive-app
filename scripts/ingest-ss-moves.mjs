#!/usr/bin/env node
// v71cj §2: Starter Story 해결 동작 라벨(moves.jsonl) → ss_moves. 원문 전문은 넣지 않음(quote만).
//   node --env-file=.env.local scripts/ingest-ss-moves.mjs [--dry]
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const SRC = 'C:\\Users\\DCU\\Desktop\\인스타납품-1024\\_system\\data\\analog\\moves.jsonl'
const dry = process.argv.includes('--dry')

const CANON = new Set(['PRICING', 'CHANNEL', 'PRODUCT_FEATURE', 'OFFER', 'OPERATIONS', 'POSITIONING', 'CONTENT', 'PARTNERSHIP', 'PACKAGING', 'ONBOARDING', 'COMMUNITY', 'SUPPORT', 'TRUST'])
// 지시서 예시(OUTREACH→CHANNEL, CUSTOMER_SUPPORT→SUPPORT, RETENTION→PRODUCT_FEATURE) + 나머지 27종 최근접 매핑
const LEVER_MAP = {
  OUTREACH: 'CHANNEL', OUTBOUND: 'CHANNEL', OUTBOUND_SALES: 'CHANNEL', DISTRIBUTION: 'CHANNEL', SALES: 'CHANNEL', PERFORMANCE_MARKETING: 'CHANNEL',
  RETENTION: 'PRODUCT_FEATURE',
  CUSTOMER_SUPPORT: 'SUPPORT', COMMUNICATION: 'SUPPORT', SERVICE: 'SUPPORT',
  PRE_ORDER: 'OFFER', PRE_SALE: 'OFFER', PRE_SALES: 'OFFER', CONVERSION: 'OFFER',
  CHECKOUT: 'OPERATIONS', PRE_LAUNCH: 'OPERATIONS', POLICY: 'OPERATIONS', PRODUCTION: 'OPERATIONS', SHIPPING: 'OPERATIONS', CULTURE: 'OPERATIONS', TEAM: 'OPERATIONS', PAYMENTS: 'OPERATIONS',
  PR: 'CONTENT', PRESENTATION: 'CONTENT', PROMOTION: 'CONTENT',
  PROOF: 'TRUST',
  VIRAL: 'COMMUNITY', REFERRAL: 'COMMUNITY',
  MARKET_ENTRY: 'POSITIONING', TARGETING: 'POSITIONING',
}

const lines = readFileSync(SRC, 'utf8').trim().split('\n')

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

  // B등급 승격 대상: case_studies.brand_name 이 있고, 그 case_moves 중 fact_check_grade='A' 가 하나라도 있는 회사명 집합
  const { data: aGradeCases, error: aErr } = await sb
    .from('case_moves')
    .select('case_study_id, fact_check_grade, case_studies!inner(brand_name)')
    .eq('fact_check_grade', 'A')
  if (aErr) { console.error('A등급 조회 실패:', aErr.message); process.exit(2) }
  const bPromoteNames = new Set((aGradeCases ?? []).map((r) => String(r.case_studies?.brand_name ?? '').trim().toLowerCase()).filter(Boolean))
  console.log(`사실확인 A등급 보유 회사 ${bPromoteNames.size}개 (B등급 승격 후보)`)

  const normCompany = (c) => String(c ?? '').replace(/\(.*?\)/g, '').trim().toLowerCase()

  let nInterviews = 0, nSkippedEmpty = 0, nRows = 0, nLeverFixed = 0, nGradeD = 0, nGradeB = 0, nGradeC = 0, nFailed = 0
  const rows = []
  for (const l of lines) {
    const obj = JSON.parse(l)
    nInterviews++
    const moves = obj.moves
    if (!moves || moves.length === 0) { nSkippedEmpty++; continue }
    const companyKey = normCompany(obj.company)
    moves.forEach((m, idx) => {
      const rawLever = String(m.lever ?? '').trim().toUpperCase()
      let lever = rawLever
      let reviewNote = null
      if (!CANON.has(rawLever)) {
        lever = LEVER_MAP[rawLever] ?? 'OPERATIONS'
        reviewNote = `원래 lever=${rawLever}`
        nLeverFixed++
      }
      let grade = 'C'
      if (!m.quote || String(m.quote).trim() === '') { grade = 'D'; nGradeD++ }
      else if (bPromoteNames.has(companyKey)) { grade = 'B'; nGradeB++ }
      else nGradeC++
      rows.push({
        slug: obj.slug, company: obj.company ?? null, category: obj.category ?? null,
        revenue_mo: Number.isFinite(obj.revenue_mo) ? obj.revenue_mo : null,
        source_url: obj.url ?? null, story_date: obj.date ?? null, move_idx: idx,
        who: m.who ?? null, blocked: m.blocked ?? null, move: m.move ?? null, result: m.result || null,
        lever, pattern: m.pattern ?? null, quote: m.quote ? String(m.quote).slice(0, 130) : null,
        grade, review_note: reviewNote,
      })
    })
  }
  nRows = rows.length
  console.log(`대상 ${nInterviews}편 · 적재행 ${nRows} · 건너뜀(빈 moves) ${nSkippedEmpty} · lever 교정 ${nLeverFixed} · 등급 B/C/D = ${nGradeB}/${nGradeC}/${nGradeD}`)
  if (dry) process.exit(0)

  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    const batch = rows.slice(i, i + CHUNK)
    const { error } = await sb.from('ss_moves').upsert(batch, { onConflict: 'slug,move_idx' })
    if (error) { nFailed += batch.length; console.error(`적재 실패 @${i}: ${error.message}`); continue }
    console.log(`[ingest-ss-moves] ${Math.min(i + CHUNK, rows.length)}/${rows.length}`)
  }
  const { count } = await sb.from('ss_moves').select('*', { count: 'exact', head: true })
  console.log(`완료 적재시도 ${nRows} 실패 ${nFailed} 표 행수(실측) ${count}`)
}

await main()
