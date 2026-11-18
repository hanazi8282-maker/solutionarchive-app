#!/usr/bin/env node
// [v71cu S7-2] 스토어 검색 발굴: 분야별 검색어(한국어·영어·일본어)로 iTunes Search → 평가 수 50+ 이고 미등록인 앱을 discovery_candidates(origin='search', 시험 소스=appstore)에 적고
// 임시 타깃(프로젝트 collecting + 앱스토어 kr·us)으로 등록한다. 하루 새 임시 타깃 30개(분야당 10), 검색 요청 100회. 429·403 → 실행 중단(우회 없음).
// 일반 명사·인프라 이름은 앱 평가 수·이름 길이 규칙으로 걸러진다(언급 루프의 제외 목록과 별개).
// 사용: node --env-file=.env.local scripts/product-discover.mjs [--dry]
import { createClient } from '@supabase/supabase-js'
const DRY = process.argv.includes('--dry')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const BATCH = `prov_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`
const PER_AREA = 10, MAX_REQ = 100, GAP = 3500
const TERMS = {
  payments_billing_accounting: [['kr', '세금계산서 장부 관리'], ['kr', '소상공인 매출 정산'], ['us', 'invoice small business'], ['us', 'bookkeeping accounting small business'], ['jp', '請求書 会計 個人事業主']],
  booking_scheduling_forms: [['kr', '예약 관리 사장님'], ['kr', '일정 예약 폼'], ['us', 'appointment booking business'], ['us', 'online forms scheduling'], ['jp', '予約管理 店舗']],
  marketing_automation: [['kr', '마케팅 자동화 문자 발송'], ['kr', '카카오 채널 고객 관리'], ['us', 'email marketing automation'], ['us', 'social media scheduler'], ['jp', 'マーケティング 自動化']],
  sales_crm: [['kr', '영업 관리 고객 CRM'], ['kr', '명함 고객 관리'], ['us', 'small business CRM sales pipeline'], ['us', 'lead management sales'], ['jp', '営業 顧客管理 CRM']],
}
const { data: ex } = await sb.from('review_targets').select('product_ref').eq('source_key', 'appstore').limit(20000)
const known = new Set((ex ?? []).map((r) => r.product_ref.split(':')[1]))
const { data: dc } = await sb.from('discovery_candidates').select('probe_ref').eq('probe_source_key', 'appstore')
for (const r of dc ?? []) known.add(String(r.probe_ref).split(':')[1])
let req = 0, stop = false
const made = []
for (const [slug, terms] of Object.entries(TERMS)) {
  let n = 0
  for (const [cc, term] of terms) {
    if (stop || n >= PER_AREA || req >= MAX_REQ) break
    req++
    const r = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&country=${cc}&entity=software&limit=10`, { headers: { accept: 'application/json' } })
    if (r.status === 429 || r.status === 403) { console.log(`${r.status} — 이 실행 중단(규칙 1)`); stop = true; break }
    if (!r.ok) { console.log('오류', r.status); continue }
    for (const a of (await r.json()).results ?? []) {
      const id = String(a.trackId)
      if (n >= PER_AREA || known.has(id) || (a.userRatingCount ?? 0) < 50 || (a.trackName ?? '').length < 3) continue
      known.add(id); n++
      made.push({ slug, cc, id, name: a.trackName, url: a.sellerUrl ?? a.trackViewUrl, ratings: a.userRatingCount, term })
    }
    await new Promise((r) => setTimeout(r, GAP))
  }
}
console.log(`검색 ${req}회 · 후보 ${made.length}`, Object.fromEntries(Object.keys(TERMS).map((k) => [k, made.filter((m) => m.slug === k).length])))
if (DRY || !made.length) process.exit(0)
let linked = 0
for (const m of made) {
  // 앞선 실행이 후보 적재 실패로 남긴 빈 프로젝트가 있으면 재사용(중복 프로젝트 방지).
  const pitch = `search-discovery ${m.slug} — ${m.name}`
  const { data: old } = await sb.from('analysis_projects').select('id').eq('product_elevator_pitch', pitch).limit(1)
  const { data: proj, error: pe } = old?.length ? { data: old[0], error: null } : await sb.from('analysis_projects').insert({ competitor_url: m.url, product_elevator_pitch: `search-discovery ${m.slug} — ${m.name}`, purpose: 'product_fit', status: 'collecting', mode: 'forward' }).select('id').single()
  if (pe) { console.log('proj', pe.message); continue }
  const { error: ce } = await sb.from('discovery_candidates').insert({ kind: 'saas', name: m.name, homepage_url: m.url, why: `iTunes search(${m.cc}) '${m.term}' · 평가 ${m.ratings}`, probe_source_key: 'appstore', probe_ref: `${m.cc}:${m.id}`, probe_hits: m.ratings, probe_at: new Date().toISOString(), verdict: 'accepted', verdict_reason: '평가 수 50+ · 미등록', project_id: proj.id, origin: 'search' })
  if (ce) { console.log('cand', ce.message); continue }
  const tg = ['kr', 'us'].map((cc) => ({ project_id: proj.id, source_key: 'appstore', product_ref: `${cc}:${m.id}`, label: `${m.slug}:${m.name}`, area: m.slug, status: 'active', onboard_batch: BATCH, layer: 'app' }))
  const { data: ins, error: te } = await sb.from('review_targets').insert(tg).select('id')
  if (te) { console.log('target', te.message); continue }
  await sb.from('target_area_links').upsert(ins.map((t) => ({ target_id: t.id, area_slug: m.slug, basis: 'search-discovery', rule_ver: 'sd-v1' })), { onConflict: 'target_id,area_slug', ignoreDuplicates: true })
  linked++
}
console.log(`등록(프로젝트·타깃 연결) ${linked}`)
