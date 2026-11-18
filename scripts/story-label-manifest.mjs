#!/usr/bin/env node
// [v71ct P0] 로컬 전문 3,314편 ↔ DB slug 대조표 + SaaS 계열 집합 실측. 읽기 전용. 결과: reports/2026-11-18/story-label-manifest.json
import fs from 'node:fs'
import os from 'node:os'
import zlib from 'node:zlib'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const GROUND = path.join(os.homedir(), 'sa-private/ground/starterstory/starterstory_stories_3314.jsonl.gz')
const stories = zlib.gunzipSync(fs.readFileSync(GROUND)).toString().split('\n').filter(Boolean).map((l) => JSON.parse(l))
const rows = []
for (let p = 0; ; p++) { const { data, error } = await sb.from('ss_moves').select('slug,category,lever').order('id').range(p * 1000, p * 1000 + 999); if (error) { console.error(error.message); process.exit(2) } rows.push(...data); if (data.length < 1000) break }
const dbSlugs = new Map(); for (const r of rows) if (!dbSlugs.has(r.slug)) dbSlugs.set(r.slug, r.category)
const local = new Map(stories.map((s) => [s.slug, s]))
const SAAS_CATS = new Set(['saas', 'productivity', 'technology', 'seo', 'sales', 'communication', 'hiring', 'hr'])
const isSaas = (s) => SAAS_CATS.has(dbSlugs.get(s.slug) ?? s.category) || s.mentions_saas === true
const usable = (s) => s.full_text && s.full_text.length >= 1500 && dbSlugs.has(s.slug)
const out = {
  generated: new Date().toISOString(), local_total: stories.length, db_slugs: dbSlugs.size,
  db_slugs_with_local_text: [...dbSlugs.keys()].filter((s) => local.has(s)).length,
  db_slugs_missing_local: [...dbSlugs.keys()].filter((s) => !local.has(s)),
  local_without_moves: stories.filter((s) => !dbSlugs.has(s.slug)).length,
  local_no_or_short_text: stories.filter((s) => !s.full_text || s.full_text.length < 1500).length,
  saas_all_with_moves: stories.filter((s) => dbSlugs.has(s.slug) && isSaas(s)).length,
  saas_usable: stories.filter((s) => usable(s) && isSaas(s)).length,
  all_usable: stories.filter(usable).length,
  saas_definition: 'DB 행동이 있고 전문 ≥1,500자 ∧ (category ∈ {saas,productivity,technology,seo,sales,communication,hiring,hr} ∨ mentions_saas). 지시서에 788 의 정의가 없어 역산.',
}
fs.writeFileSync('reports/2026-11-18/story-label-manifest.json', JSON.stringify(out, null, 1))
console.log(JSON.stringify({ ...out, db_slugs_missing_local: out.db_slugs_missing_local.length }))
