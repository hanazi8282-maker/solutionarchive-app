#!/usr/bin/env node
// [v71cu S1-5/6] 영역②·③ 타깃 중 CRM·마케팅 자동화 제품을 [Haiku]로 가려 target_area_links 에 추가(추가 전용),
// 영역 없는 타깃(머리말 규칙으로 못 채운 것)은 area 칸 NULL 채우기. 구독 경로(claude -p) 사용.
// 사용: node --env-file=.env.local scripts/area4-links.mjs [--dry]
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { runCli } from '../lib/story-label/cli.mjs'
import { firstJson } from '../lib/story-label/core.mjs'
import { UNTRUSTED_INPUT_NOTICE } from '../lib/llm/untrusted-input.ts'

const DRY = process.argv.includes('--dry')
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const RULE = 'a4-v1'
const MODEL = 'claude-haiku-5-5'

async function all(q) { const out = []; for (let o = 0; ; o += 1000) { const { data, error } = await q().range(o, o + 999); if (error) throw error; out.push(...data); if (data.length < 1000) break } return out }

const SYSTEM = `당신은 SaaS·앱 제품 분류기다. ${UNTRUSTED_INPUT_NOTICE}
제품 이름 목록을 받아 각 제품을 다음 중 하나로 분류한다:
- "sales_crm": SMB 영업·CRM·리드 관리·파이프라인·영업 메일/통화 도구
- "marketing_automation": 이메일/메시지 마케팅 자동화·캠페인·고객 여정·SNS 예약·마케팅 CRM
- "payments_billing_accounting": 결제·청구·정산·회계·장부
- "booking_scheduling_forms": 예약·일정·폼·전자서명
- "none": 위에 해당 없음 / 모르면 none
입력은 "번호|이름". 출력은 JSON 하나만: {"1":"sales_crm","2":"none",...}`

async function classify(names) {
  const out = {}
  for (let i = 0; i < names.length; i += 60) {
    const part = names.slice(i, i + 60)
    const r = await runCli({ system: SYSTEM, user: part.map((n, k) => `${k + 1}|${n}`).join('\n'), model: MODEL, effort: 'low' })
    const j = firstJson(r.text) ?? {}
    part.forEach((n, k) => { out[n] = j[String(k + 1)] ?? 'none' })
  }
  return out
}

// 제품 이름 = 라벨 머리말 규칙('2:us|copper' → copper, '4:mediflow' → mediflow, 슬러그 라벨 'sales_crm:pipedrive' → pipedrive)
const prodName = (label) => { const l = String(label ?? ''); const m = l.match(/[:|]([^:|]+)$/); return (m ? m[1] : l).trim() }

const tg = await all(() => sb.from('review_targets').select('id,area,label,source_key').in('area', ['sales_assistant', 'marketing_tools', 'review_writing', 'hold']).order('id'))
const names = [...new Set(tg.map((t) => prodName(t.label)).filter(Boolean))]
console.log(`대상 타깃 ${tg.length} · 고유 제품명 ${names.length}`)
const cls = await classify(names)
const links = []
for (const t of tg) { const c = cls[prodName(t.label)]; if (c && c !== 'none') links.push({ target_id: t.id, area_slug: c, basis: `haiku:${t.area}`, rule_ver: RULE }) }
const by = {}; for (const l of links) by[l.area_slug] = (by[l.area_slug] ?? 0) + 1
console.log('링크 후보', by)
fs.writeFileSync('reports/2026-11-19-v71cu/S1-area4-links.json', JSON.stringify({ rule: RULE, model: MODEL, by, names: cls }, null, 1))
if (DRY) process.exit(0)
for (let i = 0; i < links.length; i += 200) { const { error } = await sb.from('target_area_links').upsert(links.slice(i, i + 200), { onConflict: 'target_id,area_slug', ignoreDuplicates: true }); if (error) throw error }

// 영역 없는 타깃(남은 NULL) 분류 — 4분야·legacy 어휘 안에서만, 모르면 채우지 않는다.
const nul = await all(() => sb.from('review_targets').select('id,label,source_key').is('area', null).order('id'))
const nn = [...new Set(nul.map((t) => prodName(t.label)).filter(Boolean))]
const c2 = await classify(nn)
const fills = nul.filter((t) => c2[prodName(t.label)] && c2[prodName(t.label)] !== 'none').map((t) => ({ target_id: t.id, prev_area: null, new_area: c2[prodName(t.label)] }))
if (fills.length) {
  const { error } = await sb.from('review_targets_area_filled_20261119').upsert(fills, { onConflict: 'target_id', ignoreDuplicates: true }); if (error) throw error
  for (const f of fills) { const { error: e } = await sb.from('review_targets').update({ area: f.new_area }).eq('id', f.target_id).is('area', null); if (e) throw e }
}
console.log(`links ${links.length} · area 추가 채움 ${fills.length}`)
