#!/usr/bin/env node
// [v71cu 2-8] 인용 검증기 — 결론서 payload(또는 story-flow-samples 의 .json) 안의 모든 사례 인용(quote:{slug,episode_idx,text})이 원문 quote_orig 와 같은지 본다.
//   원문을 파일로: node scripts/story-flow-quote-check.mjs --payload <payload.json> --source fixtures/story-flow/cards.json
//   원문을 DB 로(오케스트레이터만, 읽기 전용): node --env-file=.env.local scripts/story-flow-quote-check.mjs --payload <payload.json> --db
//   결론서 하나를 토큰으로: ... --token <consult_reports.token> --db
// 기본 strict = 원문 전체 또는 문장 단위 일치만 통과. --loose = 부분 문자열 허용 + 경고(절 중간·짧은 발췌·앞 부정어).
// 종료 코드: 0 = 전부 일치 · 1 = 불일치(원문 못 찾음·인용 0건 포함 — 확인 불가를 통과로 접지 않는다) · 2 = 입력을 못 읽음 · 64 = 사용법.
import { readFileSync } from 'node:fs'
import { collectQuotes, verifyQuotes } from '../lib/consult/story-flow-select.ts'

const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i >= 0 ? process.argv[i + 1] : null }
const useDb = process.argv.includes('--db')
if (!(arg('payload') || arg('token')) || !(arg('source') || useDb)) { console.error('사용법: --payload <json> | --token <t> --db, 그리고 --source <json> | --db'); process.exit(64) }

let sb = null
if (useDb) { const { createClient } = await import('@supabase/supabase-js'); sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }) }

let payload
try {
  if (arg('payload')) payload = JSON.parse(readFileSync(arg('payload'), 'utf8'))
  else {
    const { data, error } = await sb.from('consult_reports').select('payload').eq('token', arg('token')).maybeSingle()
    if (error || !data) throw new Error(error?.message ?? 'not found')
    payload = data.payload
  }
} catch (e) { console.error(`입력 못 읽음: ${e instanceof Error ? e.message : e}`); process.exit(2) }

// 사례 인용이 들어 있는 칸: payload.story_flow(결론서) · after/before(샘플 파일). 둘 다 collectQuotes 가 훑는다.
const quotes = collectQuotes(payload)
let source = {}
if (useDb) {
  const slugs = [...new Set(quotes.map((q) => q.slug))]
  if (slugs.length) {
    // [F3] 결론서·카드와 다른 경로로 원본 표(ss_episode_tags)를 직접 읽는다 — 카드 데이터끼리 대조하면 순환 검증이다. label_run·source_key 까지 맞춘다.
    const { data, error } = await sb.from('ss_episode_tags').select('source_key,slug,label_run,episode_idx,quote_orig').in('slug', slugs).order('slug').order('label_run').order('episode_idx').limit(10000)
    if (error) { console.error(`원문 못 읽음: ${error.message}`); process.exit(2) }
    for (const r of data ?? []) (source[r.slug] ??= []).push(r)
  }
} else {
  const fx = JSON.parse(readFileSync(arg('source'), 'utf8'))
  for (const c of fx.cards ?? fx) (source[c.slug] ??= []).push(...c.episodes)
}
const r = verifyQuotes(payload, source, { mode: process.argv.includes('--loose') ? 'loose' : 'strict' })
console.log(`인용 ${r.checked}건 확인 · 불일치 ${r.mismatches.length}건`)
for (const m of r.mismatches) console.log(`  ✗ ${m.slug}#${m.episode_idx} ${m.reason}: ${m.text.slice(0, 80)}`)
for (const w of r.warnings) console.log(`  ⚠ ${w.slug}#${w.episode_idx} ${w.warn}: ${w.text.slice(0, 80)}`)
process.exitCode = r.ok ? 0 : 1
