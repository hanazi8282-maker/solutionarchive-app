#!/usr/bin/env node
// v71bi — 영역 밖 1차 relevant 재고에 "제품 종류" 라벨을 붙인다(review_topic_labels, 추가 전용).
// 영역 판정이 아니라 다음에 열 영역 후보를 찾는 탐색용이다. 기존 판정·프로젝트는 읽기만 한다(삭제·덮어쓰기 0).
//
//   node --env-file=.env.local scripts/topic-label-run.mjs --day=1 [--cap=130] [--limit=N] [--workers=3] [--dry]
//   --day=1: 프로젝트당 상한(cap)만큼 고정 seed 무작위 · --day=2: 나머지 전부. 이미 라벨된 입력은 건너뛰어 이어 돌릴 수 있다.
// 3상태(§7.1): 호출 실패·파싱 실패·어휘 밖 행은 기록하지 않는다(다음 실행이 다시 고른다). 한도(429)는 리셋까지 기다렸다 재개한다.
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { createClient } from '../lib/supabase/server.ts'
import { callLlmWithModel, isQuotaFailure } from '../lib/analysis/llm.ts'
import { extractJsonArray } from '../lib/cases/remedy-judge.ts'
import { UNTRUSTED_INPUT_NOTICE } from '../lib/llm/untrusted-input.ts'
import { parseQuotaResetAt } from '../lib/analysis/extract-auto.ts'

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d }
const day = Number(arg('day', 1)); const cap = Number(arg('cap', 130)); const limit = Number(arg('limit', 0))
const workers = Number(arg('workers', 3)); const dry = process.argv.includes('--dry')
const PV = arg('pv', 'topic-v1-2026-10-26'); const SEED = 'v71bi-2026-10-26'; const BATCH = 20; const TEXT_CHARS = 1200
const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const OUT_DIR = 'reports/2026-10-26'; mkdirSync(OUT_DIR, { recursive: true })

const sb = await createClient(); if (!sb) { console.error('DB 연결 실패'); process.exit(2) }
async function all(q) { const out = []; for (let f = 0; ; f += 1000) { const { data, error } = await q().range(f, f + 999); if (error) { console.error(error); process.exit(2) } out.push(...data); if (data.length < 1000) break } return out }

// ── 대상 ────────────────────────────────────────────────────────────────
const IN = new Set(['1', '2', '3', '4', '5', 'design'])
const projects = new Map((await all(() => sb.from('analysis_projects').select('id, area_code, business_model, product_elevator_pitch').order('id'))).map((p) => [p.id, p]))
const isOut = (p) => p && !IN.has((p.area_code ?? '').trim())
const verdicts = (await all(() => sb.from('review_relevance_verdicts').select('input_id, project_id').eq('verdict', 'relevant').is('second_verdict', null).order('input_id'))).filter((r) => isOut(projects.get(r.project_id)))
const done = new Set((await all(() => sb.from('review_topic_labels').select('input_id').eq('prompt_version', PV).order('input_id'))).map((r) => r.input_id))
const h = (id) => createHash('sha1').update(SEED + id).digest('hex')
const byProj = new Map(); for (const v of verdicts) { (byProj.get(v.project_id) ?? byProj.set(v.project_id, []).get(v.project_id)).push(v.input_id) }
const plan = []; const strat = []
for (const [pid, ids] of byProj) {
  ids.sort((a, b) => (h(a) < h(b) ? -1 : 1))
  const first = ids.slice(0, cap), rest = ids.slice(cap)
  strat.push({ project_id: pid, area: projects.get(pid).area_code, total: ids.length, day1: first.length })
  plan.push(...(day === 1 ? first : rest).map((id) => ({ input_id: id, project_id: pid })))
}
writeFileSync(`${OUT_DIR}/topic-label-stratify.json`, JSON.stringify({ seed: SEED, cap, projects: strat }, null, 1))
writeFileSync(`${OUT_DIR}/topic-label-day${day}-ids.json`, JSON.stringify(plan.map((p) => p.input_id)))
log(`대상 풀 ${verdicts.length}건 · 프로젝트 ${byProj.size}개 · day${day} 계획 ${plan.length}건 · 이미 라벨 ${done.size}건`)

// 원문(폐기 제외) — 고른 입력만
let todo = plan.filter((p) => !done.has(p.input_id))
// --limit 은 프로젝트 순서가 아니라 seed 해시 순으로 자른다(표본이 한 프로젝트로 쏠리지 않게). 일관성 점검은 --pv=topic-v1-consist-N --limit=50 으로 같은 50건을 다시 돌린다.
if (limit) todo = [...todo].sort((x, y) => (h(x.input_id) < h(y.input_id) ? -1 : 1)).slice(0, limit)
const raw = new Map(); const ids = todo.map((t) => t.input_id)
for (let i = 0; i < ids.length; i += 100) {
  const { data, error } = await sb.from('analysis_inputs').select('id, raw_text, purged_at, source_key').in('id', ids.slice(i, i + 100))
  if (error) { console.error(error); process.exit(2) }
  for (const x of data) raw.set(x.id, x)
}
todo = todo.filter((t) => { const x = raw.get(t.input_id); return x && !x.purged_at && (x.raw_text ?? '').trim() })
log(`원문 확인 뒤 라벨할 건수 ${todo.length}`)
if (dry) process.exit(0)

// ── 프롬프트 ────────────────────────────────────────────────────────────
const AREAS = ['1', '2', '3', '4', '5', 'work', 'design', 'hold-ecom', 'out-consumer', 'other']
const SEED_GROUPS = ['개발·인프라(호스팅·서버·보안·비밀번호)', '웹·제품 분석(통계·BI)', '노코드·자동화·내부 도구', '이메일·뉴스레터·메일함', '결제·판매·구독 관리', '폼·일정·전자서명', '영상·화이트보드·화상 협업', '읽기·북마크·구독 리더', '퍼블리싱·블로그·팟캐스트', '회계·재무·가계부', '고객지원·헬프데스크', '교육·강의', '프리랜서·원격 채용', '창업가 일반 고민(제품 아님)', '운세·점술·라이프스타일', '실물 소비재', 'unknown']
const groupCount = new Map(SEED_GROUPS.map((g) => [g, 0])); const labelNames = new Map()
const SYSTEM = [
  '너는 리서치 파이프라인의 분류 보조다. 수집된 글(리뷰·댓글·커뮤니티 글) 여러 건이 주어진다. 글마다 "글이 말하는 제품이 하는 일"이 어느 영역에 가장 가까운지, 어떤 종류의 제품인지 라벨을 단다.',
  '글의 주제가 아니라 글이 말하는 제품이 하는 일을 본다. 제품을 알 수 없으면 area="other", group="unknown".',
  '',
  UNTRUSTED_INPUT_NOTICE,
  '',
  '영역 코드(area): "1" 회의록·통화 요약 / "2" 영업 도우미 / "3" 마케팅 콘텐츠·광고 소재 / "4" 인사 운영(근태·급여·평가, 채용 제외) / "5" 글쓰기·문서·노트(노트·지식관리 앱 포함) / "work" 업무관리(할 일·일정·시간·프로젝트 관리) / "design" 디자인(디자인·화이트보드·이미지 제작 툴) / "hold-ecom" 쇼핑몰 리뷰·이커머스 운영 / "out-consumer" 실물 소비재 / "other" 어디도 아님.',
  'group = 대분류, label = 구체 종류(한국어 2~5단어). 사전에 없는 종류는 새로 지어도 된다. 같은 종류는 지금까지 만든 이름을 그대로 재사용한다.',
  'product = 글이 말하는 제품·서비스 이름(모르면 null). saas = 소프트웨어 서비스인가 true|false|null. rq = 구체적 이유·상황이 있으면 "reason", 한 줄 선호·불만뿐이면 "weak", 없으면 "none". lang = 글의 언어 코드(ko, en 등). conf = 0~1.',
  '주어진 id 전부에 한 줄씩 답한다. 출력은 JSON 배열 하나뿐: [{"id":"R1","area":"other","group":"이메일·뉴스레터·메일함","label":"뉴스레터 발송 도구","product":"Substack","saas":true,"rq":"weak","lang":"en","conf":0.8}]. 설명·코드블록 금지.',
].join('\n')
function userPrompt(rows) {
  const top = [...groupCount].filter(([g, n]) => n > 0 || SEED_GROUPS.includes(g)).map(([g]) => g)
  const labels = [...labelNames].sort((a, b) => b[1] - a[1]).slice(0, 80).map(([l]) => l)
  return [
    `## 대분류 사전(여기 없으면 새로 지어도 됨)`, top.join(' / '), '',
    `## 지금까지 쓴 구체 종류 이름(같은 종류면 재사용)`, labels.length ? labels.join(' / ') : '(아직 없음)', '',
    `## 글 ${rows.length}건`,
    ...rows.map((r, i) => `R${i + 1}. ${String(r.text).replace(/\s*[\r\n]+\s*/g, ' ').trim().slice(0, TEXT_CHARS)}`), '',
    `위 ${rows.length}건 전부에 대해 JSON 배열 하나만 출력해라.`,
  ].join('\n')
}

// ── 실행 ────────────────────────────────────────────────────────────────
const c = { saved: 0, callFailed: 0, parseFailed: 0, invalid: 0, dup: 0, quotaWaits: 0 }
const batches = []; for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH))
let next = 0; let batchNo = 0
const str = (v, n = 120) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null)
const tri = (v) => (v === true || v === false ? v : null)

async function runBatch(items, idx) {
  const rows = items.map((t) => ({ text: raw.get(t.input_id).raw_text }))
  let res
  for (let attempt = 0; ; attempt++) {
    try { res = await callLlmWithModel('claude-cli', SYSTEM, userPrompt(rows), 'topic-label'); break } catch (e) {
      if (isQuotaFailure(e)) {
        const reset = parseQuotaResetAt(String(e?.message ?? ''), new Date())
        const ms = Math.min(Math.max((reset ? new Date(reset).getTime() - Date.now() : 20 * 60_000) + 60_000, 60_000), 5 * 3_600_000)
        c.quotaWaits++; log(`한도 — ${Math.round(ms / 60_000)}분 기다린 뒤 재개(묶음 ${idx + 1}/${batches.length})`); await sleep(ms); continue
      }
      if (attempt < 1) { await sleep(5000); continue }
      c.callFailed += items.length; log(`호출 실패 묶음 ${idx + 1}: ${String(e?.message ?? e).slice(0, 160)}`); return
    }
  }
  const arr = extractJsonArray(res.text)
  if (!arr) { c.parseFailed += items.length; log(`파싱 실패 묶음 ${idx + 1}`); return }
  const out = []
  for (const o of arr) {
    if (!o || typeof o !== 'object') continue
    const m = /^R(\d+)$/i.exec(String(o.id ?? '').trim()); const t = m && items[Number(m[1]) - 1]
    const area = String(o.area ?? '').trim()
    if (!t || !AREAS.includes(area)) { c.invalid++; continue }
    const rq = ['reason', 'weak', 'none'].includes(o.rq) ? o.rq : null
    const conf = Number.isFinite(Number(o.conf)) ? Math.min(1, Math.max(0, Number(o.conf))) : null
    out.push({ input_id: t.input_id, project_id: t.project_id, area_guess: area, category_group: str(o.group), category_label: str(o.label), product_name: str(o.product), is_saas: tri(o.saas), reason_quality: rq, lang: str(o.lang, 12), confidence: conf == null ? null : Number(conf.toFixed(2)), model: res.model, prompt_version: PV, batch_id: `${PV}-d${day}-${idx}` })
  }
  if (out.length) {
    const { error } = await sb.from('review_topic_labels').upsert(out, { onConflict: 'input_id,prompt_version', ignoreDuplicates: true })
    if (error) { c.callFailed += out.length; log(`저장 실패 묶음 ${idx + 1}: ${error.message}`); return }
    c.saved += out.length
    for (const r of out) { if (r.category_group) groupCount.set(r.category_group, (groupCount.get(r.category_group) ?? 0) + 1); if (r.category_label) labelNames.set(r.category_label, (labelNames.get(r.category_label) ?? 0) + 1) }
  }
  c.invalid += items.length - arr.length > 0 ? items.length - arr.length : 0
  if (++batchNo % 10 === 0 || batchNo === batches.length) log(`진행 ${batchNo}/${batches.length} · 저장 ${c.saved} · 실패 ${c.callFailed + c.parseFailed} · 어휘 밖/누락 ${c.invalid} · 한도대기 ${c.quotaWaits}`)
}
await Promise.all(Array.from({ length: workers }, async () => { while (next < batches.length) { const i = next++; await runBatch(batches[i], i) } }))
log(`끝 — 저장 ${c.saved} · 호출 실패 ${c.callFailed} · 파싱 실패 ${c.parseFailed} · 어휘 밖/누락 ${c.invalid} · 남은 건은 같은 명령으로 재실행`)
process.exit(c.callFailed + c.parseFailed > 0 ? 3 : 0)
