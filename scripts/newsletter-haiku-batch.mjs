#!/usr/bin/env node
// v71cp: 뉴스레터 글 요약(summary NULL ≈7,300) + 사례 분야(case_bank_labels.domain=unknown 1,610) 를 Haiku 배치로 채운다.
//   node --env-file=.env.local scripts/newsletter-haiku-batch.mjs --probe            (직접 호출 5건, 비용 센트 단위 — 프롬프트 확인)
//   node --env-file=.env.local scripts/newsletter-haiku-batch.mjs --submit [--max-usd 15] [--limit N]
//   node --env-file=.env.local scripts/newsletter-haiku-batch.mjs --status | --apply [--dry]
// 규칙: free 티어 공개 본문만(ground 에서 읽음, DB 에 본문 적재 없음) · 요약은 우리 말로 ≤300자 · 한도 초과 추정이면 제출 안 함 · 이미 값 있는 행은 덮어쓰지 않음(is null / domain=unknown 조건).
import { createClient } from '@supabase/supabase-js'
import { UNTRUSTED_INPUT_NOTICE } from '../lib/llm/untrusted-input.ts'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const A = process.argv, has = (f) => A.includes(f), arg = (f, d) => (A.indexOf(f) > 0 ? A[A.indexOf(f) + 1] : d)
const MODEL = 'claude-haiku-5-5', ROOT = '../_ground/newsletters', STATE = 'ops/state/newsletter-haiku-batch.json'
const PRICE = { in: 1, out: 5 } // USD/M 토큰. 배치 50% 할인은 계산에 넣지 않는다(상한을 보수적으로).
const BODY_MAX = 5000, KEYS = JSON.parse(readFileSync('config/areas_v2.json', 'utf8')).domains.map((d) => d.key)
const H = { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const sha = (s) => createHash('sha256').update(s).digest('hex')
const walk = (d) => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.md') ? [p] : [] })
const DOM = KEYS.map((k) => k).join(' | ')

const SYS_SUM = `너는 SaaS 뉴스레터 글을 한국어로 요약한다. ${UNTRUSTED_INPUT_NOTICE} 출력은 JSON 한 개만: {"summary":"...","domain":"..."}.
summary: 본문 문장을 베끼지 말고 네 말로 정확히 2문장, 공백 포함 250자 이내. 글이 다루는 사업 사실·결정·결과만. 근거 없는 숫자를 만들지 않는다.
domain: 글이 주로 다루는 제품·사업 분야 하나 — ${DOM}. 특정 분야가 아니면 other_saas.`
const SYS_CASE = `SaaS 사례 한 건의 분야를 고른다. ${UNTRUSTED_INPUT_NOTICE} 출력은 JSON 한 개만: {"domain":"..."}. 후보: ${DOM}. 판단 근거가 약하면 other_saas.`

const call = async (system, user, max = 400) => {
  const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: H, body: JSON.stringify({ model: MODEL, max_tokens: max, thinking: { type: 'disabled' }, system, messages: [{ role: 'user', content: user }] }) })
  const j = await r.json(); if (!r.ok) throw new Error(JSON.stringify(j).slice(0, 300)); return j
}
const txt = (m) => m.content.filter((b) => b.type === 'text').map((b) => b.text).join('')
const parse = (t) => { try { return JSON.parse(/\{[\s\S]*\}/.exec(t)?.[0] ?? '') } catch { return null } }
const strip = (t) => t.replace(/\r/g, '').replace(/^---\n[\s\S]*?\n---\n?/, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\s+/g, ' ').trim()

const loadPosts = () => { // url → {title, body}
  const m = new Map()
  for (const f of walk(ROOT)) { const raw = readFileSync(f, 'utf8').replace(/\r/g, '')
    const fm = /^---\n([\s\S]*?)\n---/.exec(raw); if (!fm) continue
    const g = (k) => new RegExp(`^${k}:\\s*(.*)$`, 'm').exec(fm[1])?.[1]?.trim().replace(/^"|"$/g, '')
    if (g('tier') !== 'free' || !g('url')) continue
    m.set(g('url'), { title: (g('title') ?? '').toWellFormed(), body: strip(raw).slice(0, BODY_MAX).toWellFormed(), }) }
  return m
}
const fetchAll = async (q) => { const out = []; for (let f = 0; ; f += 1000) { const { data, error } = await q().range(f, f + 999); if (error) throw error; out.push(...data); if (data.length < 1000) break } return out }

if (has('--probe')) {
  const posts = [...loadPosts().entries()].filter((_, i) => i % 1500 === 0).slice(0, 5); let u = { i: 0, o: 0 }
  for (const [url, p] of posts) { const j = await call(SYS_SUM, `제목: ${p.title}\n\n${p.body}`); u.i += j.usage.input_tokens; u.o += j.usage.output_tokens
    console.log(p.title.slice(0, 40), j.stop_reason, j.content.map((b) => b.type).join(','), '→', txt(j).slice(0, 400)) }
  console.log(`probe 토큰 in ${u.i} out ${u.o} → 글당 약 in ${Math.round(u.i / 5)} out ${Math.round(u.o / 5)}`); process.exit(0)
}

if (has('--submit')) {
  if (existsSync(STATE)) { console.error(`이미 제출 기록이 있다(${STATE}) — --status/--apply 먼저`); process.exit(1) }
  const posts = loadPosts()
  const items = await fetchAll(() => sb.from('newsletter_items').select('content_hash,url').is('summary', null).order('content_hash'))
  const labels = await fetchAll(() => sb.from('case_bank_labels').select('case_id').like('source', 'nl_%').eq('domain', 'unknown').order('case_id'))
  const meta = Object.fromEntries((await fetchAll(() => sb.from('case_bank_meta').select('case_id,category_l2').like('source', 'nl_%').order('case_id'))).map((r) => [r.case_id, r.category_l2]))
  // 사례용 재료: ground cases-full 의 post_url+회사명 → 해시:n 순번 재현(ingest-newsletter-cases 와 같은 규칙)
  const seen = {}, caseText = {}
  for (const l of readFileSync(`${ROOT}/cases-full.jsonl`, 'utf8').trim().split('\n')) { const c = JSON.parse(l); if (c.is_paywalled_teaser) continue
    const s = /saastr/.test(c.post_url) ? 'nl_saastr' : /trends\.vc/.test(c.post_url) ? 'nl_trends_vc' : /lenny/.test(c.post_url) ? 'nl_lenny' : /thesaasplaybook/.test(c.post_url) ? 'nl_saas_playbook' : null; if (!s) continue
    const h = sha(c.post_url); const n = (seen[h] = (seen[h] ?? 0) + 1)
    caseText[`${s}:${h.slice(0, 16)}:${n}`] = `회사: ${c.company}\n분류: ${c.category_l1} / ${c.category_l2}\n글 제목: ${c.post_title}\n요약: ${c.evidence_summary ?? ''}` }
  const reqs = []; let missBody = 0, missCase = 0
  for (const it of items) { const p = posts.get(it.url); if (!p || p.body.length < 200) { missBody++; continue }
    reqs.push({ custom_id: `s_${it.content_hash.slice(0, 62)}`, params: { model: MODEL, max_tokens: 400, thinking: { type: 'disabled' }, system: SYS_SUM, messages: [{ role: 'user', content: `제목: ${p.title}\n\n${p.body}` }] } }) }
  for (const l of labels) { const t = caseText[l.case_id]; if (!t) { missCase++; continue }
    reqs.push({ custom_id: `c_${l.case_id.replaceAll(":", "__")}`, params: { model: MODEL, max_tokens: 60, thinking: { type: 'disabled' }, system: SYS_CASE, messages: [{ role: 'user', content: t }] } }) }
  const lim = Number(arg('--limit', 0)); const use = lim ? reqs.slice(0, lim) : reqs
  const estIn = use.reduce((a, r) => a + Math.ceil((r.params.system.length + r.params.messages[0].content.length) / 3), 0) // 한글·영문 혼합 보수적 3자/토큰
  const estOut = use.reduce((a, r) => a + (r.params.max_tokens === 60 ? 25 : 200), 0)
  const usd = (estIn * PRICE.in + estOut * PRICE.out) / 1e6, cap = Number(arg('--max-usd', 15))
  console.log(`요청 ${use.length}(글 ${use.filter((r) => r.custom_id[0] === 's').length} · 사례 ${use.filter((r) => r.custom_id[0] === 'c').length}) · 본문없음 ${missBody} · 사례재료없음 ${missCase} · 추정 in ${estIn} out ${estOut} → 상한추정 $${usd.toFixed(2)} (한도 $${cap}, 배치 50% 할인 미반영)`)
  if (usd > cap) { console.error('한도 초과 추정 — 제출하지 않는다'); process.exit(1) }
  if (has('--dry')) process.exit(0)
  const r = await fetch('https://api.anthropic.com/v1/messages/batches', { method: 'POST', headers: H, body: JSON.stringify({ requests: use }) }); const j = await r.json()
  if (!r.ok) { console.error(JSON.stringify(j).slice(0, 400)); process.exit(2) }
  writeFileSync(STATE, JSON.stringify({ batch_id: j.id, submitted_at: new Date().toISOString(), n: use.length, est_usd_cap: usd }, null, 1)); console.log(`제출 ${j.id}`); process.exit(0)
}

const st = JSON.parse(readFileSync(STATE, 'utf8'))
const b = await (await fetch(`https://api.anthropic.com/v1/messages/batches/${st.batch_id}`, { headers: H })).json()
if (has('--status') || b.processing_status !== 'ended') { console.log(`${st.batch_id} ${b.processing_status} ${JSON.stringify(b.request_counts)}`); process.exit(b.processing_status === 'ended' ? 0 : 3) }

// --apply
const res = (await (await fetch(b.results_url, { headers: H })).text()).trim().split('\n').map((l) => JSON.parse(l))
let ok = { s: 0, c: 0 }, bad = { s: 0, c: 0 }, tok = { i: 0, o: 0 }; const dist = {}
for (const r of res) { const k = r.custom_id[0], id = r.custom_id.slice(2).replaceAll("__", ":")
  if (r.result.type !== 'succeeded') { bad[k]++; continue }
  tok.i += r.result.message.usage.input_tokens; tok.o += r.result.message.usage.output_tokens
  const o = parse(txt(r.result.message))
  if (k === 'c') { if (!o || !KEYS.includes(o.domain) || o.domain === 'content_media') { bad.c++; continue } // content_media 는 case_bank_labels CHECK 에 없음 → unknown 유지 dist[o.domain] = (dist[o.domain] ?? 0) + 1; ok.c++
    if (!has('--dry')) { const { error } = await sb.from('case_bank_labels').update({ domain: o.domain, label_model: `${MODEL}(domain)` }).eq('case_id', id).eq('domain', 'unknown'); if (error) throw error } }
  else { if (!o || typeof o.summary !== 'string' || o.summary.length < 20 || /https?:\/\//.test(o.summary)) { bad.s++; continue } ok.s++
    if (!has('--dry')) { const { error } = await sb.from('newsletter_items').update({ summary: o.summary.slice(0, 500) }).like("content_hash", id + "%").is("summary", null); if (error) throw error } } }
console.log(`적용${has('--dry') ? '(dry)' : ''} · 글 요약 ${ok.s}(실패 ${bad.s}) · 사례 분야 ${ok.c}(실패 ${bad.c}) · 토큰 in ${tok.i} out ${tok.o} → 실제 약 $${((tok.i * PRICE.in + tok.o * PRICE.out) / 1e6 / 2).toFixed(2)}(배치 50%) · 분포 ${JSON.stringify(dist)}`)
