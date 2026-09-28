#!/usr/bin/env node
// /relevance/grade 카드의 번역·제품 배경·스레드 제목을 미리 만든다(야간 배치, .github/workflows/relevance-translate.yml).
//
// 남헌 2026-09-29: 영어 VOC 를 채점할 때마다 다른 채팅에 복사해 번역·맥락을 묻던 것을 화면에 넣는다.
//
// 무엇을 하나
//   1. 오늘(KST)의 채점 묶음을 화면과 같은 규칙(lib/relevance-feedback/sample.ts pickBatch)으로 뽑는다. 판정 행은 **묶음을 고르는 데만**
//      쓰고 input_id 만 앞으로 넘긴다 — 판정 값은 프롬프트 어디에도 들어가지 않는다(채점 독립성).
//      --rounds N(기본 2): 첫 묶음을 뺀 다음 묶음까지 미리 만든다. 야간 1차·2차 판정이 모집단을 바꾸면 아침 묶음이 조금 달라질 수 있어서다.
//   2. 원문(analysis_inputs.raw_text)·제품 소개(analysis_projects.product_elevator_pitch)를 읽어 번역·배경을 만들고 캐시 테이블에 UPSERT.
//      한 번 만든 것은 다시 부르지 않는다(needsWork: 행 없음 · prompt_version 다름 · --retry-failed 일 때 failed).
//      같은 스레드의 제목 번역은 1회만(reuseThreadTitle). 한국어 원문은 부르지 않고 skipped.
//   3. 사후검사(checkTranslation·checkBackground)에 걸린 출력은 failed 로만 남는다 — 본문 NULL(DB CHECK 가 강제).
//
// 사용:
//   node scripts/relevance-translate.mjs --dry                 # 대상 선정만. LLM·DB 쓰기 없음
//   node scripts/relevance-translate.mjs --sample [--local-cli]# DB 없이 하드코딩 표본 6건 — 프롬프트·검사 실물 확인용. --local-cli 는 로컬 claude 로그인 그대로
//   node scripts/relevance-translate.mjs --retry-failed        # failed 행도 다시 시도
//   node scripts/relevance-translate.mjs --ids <uuid,uuid>     # 묶음 대신 지정 행
//   provider: LLM_PROVIDER(기본 claude-cli — 구독 경로, Gemini 무료 쿼터를 안 건드린다). 모델: CLAUDE_CLI_MODEL(워크플로 기본 sonnet).
//
// 종료코드: 0 정상(대상 0·마감 도달 포함) · 2 설정/조회 실패(마이그 000035 미적용 포함) · 3 저장 실패 1건 이상

import { spawn } from 'node:child_process'
import { createClient } from '../lib/supabase/server.ts'
import { callLlmWithModel, requiredKeyFor, resolveProvider } from '../lib/analysis/llm.ts'
import { loadAllVerdicts, isMissingRelation } from '../lib/relevance-feedback/db.ts'
import { pickBatch, kstDate } from '../lib/relevance-feedback/sample.ts'
import {
  TRANSLATE_PROMPT_VERSION, TRANSLATIONS_MIGRATION, generateBackground, generateTranslation, needsWork, parseSourceContext, reuseThreadTitle,
} from '../lib/relevance-feedback/translate.ts'

const args = process.argv.slice(2)
const has = (f) => args.includes(f)
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] ? args[i + 1] : d }
const dry = has('--dry')
const sample = has('--sample')
const retryFailed = has('--retry-failed')
const rounds = Math.max(1, Number(opt('--rounds', '2')) || 2)
const onlyIds = opt('--ids', '').split(',').map((s) => s.trim()).filter(Boolean)
const DEADLINE_MS = (Number(process.env.TRANSLATE_DEADLINE_MIN) > 0 ? Number(process.env.TRANSLATE_DEADLINE_MIN) : 25) * 60_000
const startedAt = Date.now()

const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`)
const warn = (m) => { if (process.env.GITHUB_ACTIONS) console.log(`::warning::${m}`); log(`⚠️ ${m}`) }
const die = (m) => { console.error(`✗ ${m}`); process.exit(2) }

// 이 스크립트의 기본 프로바이더는 claude-cli 다(llm.ts 기본값 gemini 와 다르다 — 2차 판정과 같은 Gemini 무료 쿼터를 나눠 쓰지 않는다).
process.env.LLM_PROVIDER ??= 'claude-cli'
const provider = resolveProvider()

/** 로컬 확인용 — 이 머신에 로그인된 claude 를 그대로 쓴다(llm.ts 경로는 HOME 을 /tmp 로 돌려 로컬 로그인이 안 보인다). */
function localCliCall(system, user) {
  const bin = process.env.CLAUDE_CLI_PATH || 'claude'
  const model = process.env.CLAUDE_CLI_MODEL || 'sonnet'
  return new Promise((resolve, reject) => {
    const child = spawn(bin, ['-p', '--output-format', 'json', '--max-turns', '1', '--model', model], { stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''; let err = ''
    child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8')
    child.stdout.on('data', (d) => { out += d }); child.stderr.on('data', (d) => { err += d })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`claude exit ${code}: ${err.slice(0, 300)} ${out.slice(0, 300)}`))
      try { const env = JSON.parse(out); if (env.is_error) return reject(new Error(String(env.result).slice(0, 300))); resolve({ text: String(env.result ?? ''), model: String(env.model ?? model) }) }
      catch { resolve({ text: out, model }) }
    })
    child.stdin.on('error', () => {})
    child.stdin.end(`${system}\n\n---\n\n${user}`, 'utf8')
  })
}

const call = has('--local-cli')
  ? localCliCall
  : async (system, user, label) => { const r = await callLlmWithModel(provider, system, user, label); return { text: r.text, model: r.model } }

// ── --sample: DB 없이 프롬프트·사후검사 실물 확인 ──────────────────────────────
if (sample) {
  const items = [
    { input_id: 's1', project_id: 'p-convertkit', source_key: 'hackernews', raw_text: '[HN: Ask HN: What email newsletter service do you use? · https://news.ycombinator.com/item?id=12345678] I use ConvertKit for the newsletter. Its pricing is far more reasonable than MailChimp and the like.' },
    { input_id: 's2', project_id: 'p-lemonsqueezy', source_key: 'hackernews', raw_text: '[HN: Show HN: SuperWhisper – fast on-device voice to text for macOS · https://news.ycombinator.com/item?id=23456789] Based on this feedback added a lifetime license option. https://superwhisperapp.lemonsqueezy.com/checkout?cart=abc123' },
    { input_id: 's3', project_id: 'p-plausible', source_key: 'hackernews', raw_text: '[HN: Plausible Analytics – privacy-friendly Google Analytics alternative · https://news.ycombinator.com/item?id=34567890] I\'ve been using Plausible for 2 weeks now and will be paying once the trial ends. The UI is very straightforward and the pricing is fair for what we need. We really don\'t need anything else, honestly GA4 was overkill and confusing.' },
    { input_id: 's4', project_id: 'p-calcom', source_key: 'producthunt', raw_text: '[Product Hunt 댓글 · cal-com] Congrats on the launch! I\'m personally using Cal.com, it\'s free and I\'m very happy. One thing though: the Google Calendar sync sometimes lags by a few minutes and I double-booked once.' },
    { input_id: 's5', project_id: 'p-baremetrics', source_key: 'youtube', raw_text: '[YouTube 댓글 · dQw4w9WgXcQ] Switched from Baremetrics to ChartMogul last year because the Stripe sync kept breaking and support took a week to reply. Not worth $129/mo for that.' },
    { input_id: 's6', project_id: 'p-oralb', source_key: 'danawa', raw_text: '주문후 배송까지 5일 걸린거 같네요. 제품 포장 꼼꼼하고 튼튼하게 잘 왔어요.' },
  ]
  const projects = [
    { id: 'p-lemonsqueezy', product_elevator_pitch: 'Lemon Squeezy is a merchant of record for software and digital products: it handles payments, global sales tax/VAT, fraud prevention, refunds, licensing and subscriptions for SaaS companies and creators, charging a percentage fee per transaction.', competitor_url: 'https://www.lemonsqueezy.com' },
    { id: 'p-convertkit', product_elevator_pitch: 'ConvertKit (now Kit) is an email marketing platform for creators: newsletters, automations, landing pages, forms and paid newsletters.', competitor_url: 'https://kit.com' },
    { id: 'p-calcom', product_elevator_pitch: 'Cal.com is an open-source scheduling tool (Calendly alternative) that lets people book meetings from a link, syncing with Google/Outlook calendars; free plan plus paid team/enterprise tiers and self-hosting.', competitor_url: 'https://cal.com' },
  ]
  const titles = []
  for (const it of items) {
    const ctx = parseSourceContext(it.source_key, it.raw_text)
    const reuse = reuseThreadTitle(titles, it.source_key, ctx.threadKey)
    const row = await generateTranslation(call, it, { threadTitleKo: reuse })
    titles.push(row)
    console.log(`\n── ${it.input_id} (${it.source_key}) → ${row.status}${row.fail_reason ? ` · ${row.fail_reason}` : ''} · model=${row.model ?? '-'}`)
    console.log(`원문   : ${it.raw_text}`)
    if (ctx.threadTitle || ctx.threadRef) console.log(`스레드 : ${row.thread_title_ko ?? '(제목 번역 없음)'}${ctx.threadTitle ? ` ← ${ctx.threadTitle}` : ` (제목 미저장 · ${ctx.threadRef})`}`)
    console.log(`번역   : ${row.text_ko ?? '(없음)'}`)
  }
  for (const p of projects) {
    const row = await generateBackground(call, p)
    console.log(`\n── 배경 ${p.id} → ${row.status}${row.fail_reason ? ` · ${row.fail_reason}` : ''} · model=${row.model ?? '-'}`)
    console.log(`소개   : ${p.product_elevator_pitch}`)
    console.log(`배경   : ${row.background ?? '(없음)'}`)
  }
  process.exit(0)
}

// ── 본 실행 ───────────────────────────────────────────────────────────────────
const requiredKey = requiredKeyFor(provider)
if (!dry && requiredKey && !process.env[requiredKey]) die(`${requiredKey} 가 없다(provider=${provider}). 시작하지 않는다.`)

const sb = await createClient()
if (!sb) die('DB 연결 실패 — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')

log(`번역·배경 배치${dry ? ' (--dry: 대상 선정만)' : ''} — provider=${provider} · 버전 ${TRANSLATE_PROMPT_VERSION} · rounds ${rounds}${retryFailed ? ' · failed 재시도' : ''}`)

// 1. 대상 input_id — 화면과 같은 묶음. 판정 행은 여기서만 쓰고 앞으로 넘기지 않는다.
let ids = onlyIds
if (ids.length === 0) {
  const loaded = await loadAllVerdicts(sb)
  if ('error' in loaded) die(`판정 행 조회 실패: ${loaded.error}`)
  const today = kstDate(new Date().toISOString()) ?? ''
  const exclude = new Set()
  for (let r = 0; r < rounds; r++) {
    const batch = pickBatch(loaded.rows, { today, exclude })
    if (batch.items.length === 0) break
    for (const it of batch.items) { ids.push(it.row.input_id); exclude.add(it.row.input_id) }
  }
  ids = [...new Set(ids)]
  log(`  · 판정 ${loaded.rows.length}행 → 묶음 ${rounds}회 = 대상 ${ids.length}건 (${today})`)
}
if (ids.length === 0) { log('대상 0건 — 끝.'); process.exit(0) }

// 2. 원문 — 판정 컬럼 없는 테이블에서 필요한 4개 컬럼만.
const { data: inputs, error: inErr } = await sb.from('analysis_inputs').select('id, project_id, source_key, raw_text').in('id', ids).not('raw_text', 'is', null)
if (inErr) die(`원문 조회 실패: ${inErr.message}`)
const items = (inputs ?? []).filter((r) => (r.raw_text ?? '').trim()).map((r) => ({ input_id: r.id, project_id: r.project_id, source_key: r.source_key ?? null, raw_text: r.raw_text }))

// 3. 캐시 — 테이블이 없으면(마이그 전) 시끄럽게 멈춘다. 조용히 0건으로 돌지 않는다(§7.1).
const { data: existing, error: exErr } = await sb.from('relevance_translations').select('input_id, source_key, thread_key, thread_title, thread_title_ko, status, prompt_version').in('input_id', items.map((i) => i.input_id))
if (exErr) die(isMissingRelation(exErr) ? `relevance_translations 없음 — 마이그 ${TRANSLATIONS_MIGRATION} 미적용` : `캐시 조회 실패: ${exErr.message}`)
const cached = new Map((existing ?? []).map((r) => [r.input_id, r]))
const todo = items.filter((i) => needsWork(cached.get(i.input_id), { retryFailed }))

// 같은 스레드 제목 번역은 1회 — 캐시된 다른 댓글 행에서 가져온다.
const threadKeys = [...new Set(todo.map((i) => parseSourceContext(i.source_key, i.raw_text).threadKey).filter(Boolean))]
const titleRows = []
if (threadKeys.length) {
  const { data, error } = await sb.from('relevance_translations').select('source_key, thread_key, thread_title, thread_title_ko, status, prompt_version').in('thread_key', threadKeys).not('thread_title_ko', 'is', null)
  if (error) warn(`스레드 제목 캐시 조회 실패(${error.message}) — 제목은 새로 부른다`)
  else titleRows.push(...data)
}

// 4. 프로젝트 배경
const pids = [...new Set(items.map((i) => i.project_id).filter(Boolean))]
const { data: projects, error: pErr } = pids.length ? await sb.from('analysis_projects').select('id, product_elevator_pitch, competitor_url').in('id', pids) : { data: [], error: null }
if (pErr) die(`프로젝트 조회 실패: ${pErr.message}`)
const { data: bgRows, error: bgErr } = pids.length ? await sb.from('relevance_product_backgrounds').select('project_id, status, prompt_version').in('project_id', pids) : { data: [], error: null }
if (bgErr) die(isMissingRelation(bgErr) ? `relevance_product_backgrounds 없음 — 마이그 ${TRANSLATIONS_MIGRATION} 미적용` : `배경 캐시 조회 실패: ${bgErr.message}`)
const bgCached = new Map((bgRows ?? []).map((r) => [r.project_id, r]))
const bgTodo = (projects ?? []).filter((p) => needsWork(bgCached.get(p.id), { retryFailed }))

log(`  · 원문 ${items.length}건 중 번역 대상 ${todo.length}건(캐시 ${items.length - todo.length}) · 프로젝트 ${pids.length}건 중 배경 대상 ${bgTodo.length}건`)
if (dry) { for (const i of todo) log(`    - ${i.input_id} ${i.source_key ?? '-'} ${parseSourceContext(i.source_key, i.raw_text).threadKey ?? ''}`); process.exit(0) }

// 5. 생성·저장 — 한 건씩 UPSERT(실패 1건이 나머지를 막지 않는다). 마감이 오면 남은 건은 내일(§7.2: 몇 건째인지 남긴다).
const n = { ok: 0, failed: 0, skipped: 0, saveErr: 0, titleReuse: 0 }
const overDeadline = () => Date.now() - startedAt > DEADLINE_MS
let i = 0
for (const p of bgTodo) {
  if (overDeadline()) break
  const row = await generateBackground(call, p)
  n[row.status]++
  const { error } = await sb.from('relevance_product_backgrounds').upsert(row, { onConflict: 'project_id' })
  if (error) { n.saveErr++; warn(`배경 저장 실패 ${p.id}: ${error.message}`) }
  else log(`  배경 ${p.id} → ${row.status}${row.fail_reason ? ` (${row.fail_reason})` : ''}`)
}
for (const it of todo) {
  if (overDeadline()) { warn(`마감 ${DEADLINE_MS / 60000}분 도달 — ${i}/${todo.length}건에서 멈춤. 남은 건은 다음 실행.`); break }
  i++
  const ctx = parseSourceContext(it.source_key, it.raw_text)
  const reuse = reuseThreadTitle(titleRows, it.source_key, ctx.threadKey)
  if (reuse) n.titleReuse++
  const row = await generateTranslation(call, it, { threadTitleKo: reuse })
  n[row.status]++
  if (row.thread_title_ko && !reuse) titleRows.push(row)
  const { error } = await sb.from('relevance_translations').upsert(row, { onConflict: 'input_id' })
  if (error) { n.saveErr++; warn(`번역 저장 실패 ${it.input_id}: ${error.message}`) }
  else log(`  번역 ${it.input_id} (${it.source_key ?? '-'}) → ${row.status}${row.fail_reason ? ` (${row.fail_reason})` : ''}`)
}

log(`끝 — ok ${n.ok} · failed ${n.failed} · skipped ${n.skipped} · 제목 재사용 ${n.titleReuse} · 저장 실패 ${n.saveErr}`)
if (n.failed > 0) warn(`사후검사·호출 실패 ${n.failed}건 — 화면에는 "번역 실패"로 뜬다. --retry-failed 로 재시도.`)
process.exit(n.saveErr > 0 ? 3 : 0)
