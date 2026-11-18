#!/usr/bin/env node
// [v71cu S4] 4분야 앱 타깃 투입. 설계서 3-2 후보 이름을 iTunes Search(공개 API)로 실재 확인하고(평가 수 50+),
// 프로젝트(collecting) + 앱스토어 kr·us(+jp 선택) 타깃을 새 행으로 넣는다. onboard_batch='area4_20261119', 롤백 표 review_targets_area4_20261119.
// 구글 플레이는 검색 경로가 robots 상 금지라 쓰지 않는다 — gp: 인자(패키지 id)로 확인된 것만 넣는다.
// 사용: node --env-file=.env.local scripts/area4-seed.mjs [--dry] [--per-area 15]
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const DRY = process.argv.includes('--dry')
const PER = Number(process.argv[process.argv.indexOf('--per-area') + 1]) || 15
const BATCH = 'area4_20261119'
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const CANDS = {
  payments_billing_accounting: ['캐시노트', '머니핀', '이지샵', '위하고', '쎔', '페이히어', 'Wave Accounting', 'FreshBooks', 'Zoho Books', 'Zoho Invoice', 'Square', 'PayPal Business', 'Invoice2go', 'Expensify', 'Stripe Dashboard', 'QuickBooks', 'Xero', 'Wise Business', 'Billy', '토스페이먼츠'],
  booking_scheduling_forms: ['되는시간', '공비서', '네이버 예약', '모두싸인', 'Waalaa', 'Acuity Scheduling', 'Setmore', 'Square Appointments', 'Booksy', 'Fresha', 'Cal.com', 'Doodle', 'Jotform', 'Typeform', 'Tally Forms', 'Calendly', '캐치테이블', '테이블링', 'Google Forms', 'Zoho Bookings'],
  marketing_automation: ['채널톡', '스티비', '카카오톡 채널 관리자', 'Klaviyo', 'Brevo', 'ActiveCampaign', 'Omnisend', 'Constant Contact', 'Zoho Campaigns', 'ManyChat', 'Buffer', 'Later', 'Mailchimp', 'HubSpot', 'SendGrid', 'Hootsuite', 'Canva', 'Linktree', 'Sprout Social', 'Meta Business Suite'],
  sales_crm: ['리멤버', '세일즈맵', '릴레잇', 'Salesforce', 'HubSpot CRM', 'Freshsales', 'monday sales CRM', 'Close CRM', 'Attio', 'Pipedrive', 'Zoho CRM', 'Insightly', 'Copper CRM', 'Streak CRM', 'Bitrix24', 'Capsule CRM', 'Nimble', 'Less Annoying CRM', 'Agile CRM', 'Apptivo'],
}

async function itunes(term, cc) {
  const r = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&country=${cc}&entity=software&limit=5`, { headers: { accept: 'application/json' } })
  if (!r.ok) throw new Error(`itunes ${r.status}`)
  return (await r.json()).results ?? []
}
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9가-힣]/g, '')

const existing = new Set((await sb.from('review_targets').select('source_key,product_ref').eq('source_key', 'appstore').limit(5000)).data?.map((x) => `${x.product_ref.split(':')[1]}`) ?? [])
const picks = []
let STOP = false
for (const [slug, names] of Object.entries(CANDS)) {
  let n = 0
  if (STOP) break
  for (const name of names) {
    if (n >= PER) break
    let hit = null
    for (const cc of ['kr', 'us']) {
      try {
        const res = await itunes(name, cc)
        hit = res.find((a) => norm(a.trackName).includes(norm(name).slice(0, 6)) && (a.userRatingCount ?? 0) >= 50)
        if (hit) { hit.cc = cc; break }
      } catch (e) { console.log('ERR', name, cc, e.message); if (/429|403/.test(e.message)) { STOP = true; break } }
      await new Promise((r) => setTimeout(r, 3500))
    }
    if (STOP) { console.log('429/403 — 이 실행 중단(규칙 1). 남은 후보는 다음 실행에서.'); break }
    if (!hit) { console.log(`- 없음/평가수 미달: ${slug} ${name}`); continue }
    if (existing.has(String(hit.trackId))) { console.log(`- 이미 등록: ${name}`); continue }
    existing.add(String(hit.trackId)); n++
    picks.push({ slug, name, appId: String(hit.trackId), trackName: hit.trackName, url: hit.sellerUrl ?? hit.trackViewUrl, ratings: hit.userRatingCount, cc: hit.cc })
  }
}
console.log(`선택 ${picks.length}`, Object.fromEntries(Object.keys(CANDS).map((k) => [k, picks.filter((p) => p.slug === k).length])))
fs.writeFileSync('reports/2026-11-19-v71cu/S4-area4-picks.json', JSON.stringify(picks, null, 1))
if (DRY) process.exit(0)

const created = []
for (const p of picks) {
  const { data: proj, error } = await sb.from('analysis_projects').insert({ competitor_url: p.url, product_elevator_pitch: `areas_v2 ${p.slug} 후보 — ${p.trackName}`, purpose: 'product_fit', status: 'collecting', mode: 'forward' }).select('id').single()
  if (error) { console.log('proj ERR', p.name, error.message); continue }
  const tg = ['kr', 'us'].map((cc) => ({ project_id: proj.id, source_key: 'appstore', product_ref: `${cc}:${p.appId}`, label: `${p.slug}:${p.name}`, area: p.slug, status: 'active', onboard_batch: BATCH, next_visit_at: null }))
  const { data: ins, error: e2 } = await sb.from('review_targets').insert(tg).select('id')
  if (e2) { console.log('target ERR', p.name, e2.message); continue }
  for (const t of ins) created.push({ target_id: t.id, project_id: proj.id })
  await sb.from('target_area_links').upsert(ins.map((t) => ({ target_id: t.id, area_slug: p.slug, basis: 'area4-seed', rule_ver: 'a4-seed-v1' })), { onConflict: 'target_id,area_slug', ignoreDuplicates: true })
}
fs.writeFileSync('reports/2026-11-19-v71cu/S4-rollback-targets.json', JSON.stringify(created))
console.log(`프로젝트 ${new Set(created.map((c) => c.project_id)).size} · 타깃 ${created.length}`)
