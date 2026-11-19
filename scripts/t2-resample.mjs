#!/usr/bin/env node
// T2 재감사 표본 생성(v71cu, 2026-11-19 계획 §5) — DB 를 **읽기만** 한다. 서브에이전트가 아니라 오케스트레이터가 돌린다(서비스키 필요).
//
// 사용법:
//   node --env-file=.env.local scripts/t2-resample.mjs [--new-since 2026-11-18] [--sources src1,src2,...] [--seed 20261119] [--out <json>]
//   node scripts/t2-resample.mjs --selftest        # DB 없이 표본 뽑기 로직만 확인
//
//   세트 A (50) — 킬스위치 감사 창 그대로: rr-v2 ∧ auto_approved_at ∧ human_verdict 인 행 중 scoreApproval 이 매겨지는 행을
//                 human_graded_at 최신순 50건(lib/analysis/auto-approval.ts killSwitch 와 같은 자르기). 오류 수를 killSwitch 결과와 대조해 찍는다.
//   세트 B (20) — 11/17 미채점 표본: reports/2026-11-16/t2-content-guard-v71cp.md 끝의 input_id 20개(파일에서 읽는다, 20개가 아니면 멈춤).
//                 사람 채점이 DB 에 들어갔는지(human_verdict·human_product_informative)를 함께 찍는다.
//   세트 C (30) — 새 소스 글: 1차·2차 완전 동의(meetsRrV2) ∧ 사람 미채점 ∧ judged_at ≥ --new-since 인 행에서 고정 시드로 30건, 소스당 최대 8건.
//                 --sources 를 주면 그 소스만(v71cu 새 포럼 7곳·googleplay·4분야 앱·youtube 의 실제 source_key 를 넣는다). A·B 와 겹치면 뺀다.
//   출력 = ops/state/t2-eval/resample-2026-11-19.json — [{input_id, project_id, set}] (본문 없음 — 공개 리포). 하네스 입력 그대로:
//   node --env-file=.env.local scripts/t2-approval-eval.mjs --sample ops/state/t2-eval/resample-2026-11-19.json --criteria v22 --info v2
// 종료코드: 0 완료 · 2 설정/조회 실패·건수 불일치(§7.1)

import fs from 'node:fs'
import path from 'node:path'
import { rng, shuffle } from '../lib/analysis/relevance-judge.ts'

const args = process.argv.slice(2)
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null }
const die = (m) => { console.error(`✗ ${m}`); process.exit(2) }

/** 고정 시드로 섞은 뒤 소스당 perSource 건까지, 합계 total 건. 순수 함수. */
export function pickPerSource(rows, { total, perSource, seed }) {
  const out = [], per = new Map()
  for (const r of shuffle([...rows].sort((a, b) => (a.input_id < b.input_id ? -1 : 1)), rng(seed))) {
    if (out.length >= total) break
    const n = per.get(r.source_key) ?? 0
    if (n >= perSource) continue
    per.set(r.source_key, n + 1)
    out.push(r)
  }
  return out
}

if (args.includes('--selftest')) {
  const rows = [...Array(100)].map((_, i) => ({ input_id: `id-${String(i).padStart(3, '0')}`, source_key: i < 60 ? 'big' : `s${i % 5}` }))
  const a = pickPerSource(rows, { total: 30, perSource: 8, seed: 1 })
  const b = pickPerSource([...rows].reverse(), { total: 30, perSource: 8, seed: 1 })
  const per = a.reduce((m, r) => ({ ...m, [r.source_key]: (m[r.source_key] ?? 0) + 1 }), {})
  const checks = [
    [Object.values(per).every((n) => n <= 8), '소스당 최대 8'],
    [a.length === 30, `합계 30 (실제 ${a.length})`],
    [JSON.stringify(a) === JSON.stringify(b), '입력 순서와 무관하게 같은 시드 → 같은 표본'],
    [pickPerSource(rows, { total: 30, perSource: 8, seed: 2 }).map((r) => r.input_id).join() !== a.map((r) => r.input_id).join(), '시드가 다르면 다른 표본'],
    [pickPerSource(rows.slice(0, 60), { total: 30, perSource: 8, seed: 1 }).length === 8, '소스가 하나뿐이면 8건에서 멈춘다(채우려고 상한을 넘지 않는다)'],
  ]
  for (const [c, n] of checks) console.log(`${c ? '✓' : '✗'} ${n}`)
  process.exit(checks.every(([c]) => c) ? 0 : 1)
}

const { createClient } = await import('../lib/supabase/server.ts')
const { AUTO_APPROVAL_RULE, KILL, killSwitch, meetsRrV2, scoreApproval } = await import('../lib/analysis/auto-approval.ts')
const sb = await createClient()
if (!sb) die('DB 연결 실패 — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')

async function pageAll(build) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build().order('input_id').range(from, from + 999)
    if (error) die(`조회 실패: ${error.code ?? ''} ${error.message}`)
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

// ── 세트 A ──
const audits = await pageAll(() => sb.from('review_relevance_verdicts')
  .select('input_id, project_id, human_verdict, human_product_informative, human_graded_at')
  .not('auto_approved_at', 'is', null).eq('auto_approval_rule', AUTO_APPROVAL_RULE).not('human_verdict', 'is', null))
const win = audits.filter((a) => scoreApproval(a) !== null)
  .sort((a, b) => Date.parse(b.human_graded_at) - Date.parse(a.human_graded_at)).slice(0, KILL.window)
const winErrors = win.filter((a) => scoreApproval(a) === 'error').length
const ks = killSwitch(audits, { now: new Date(), since: new Date(0) })
if (ks.n !== win.length || ks.errors !== winErrors) die(`창 재현 불일치 — 여기 ${win.length}건·오류 ${winErrors} vs killSwitch ${ks.n}건·오류 ${ks.errors}`)
console.log(`세트 A: 감사 창 ${win.length}건 · 오류 ${winErrors}건 (killSwitch ${ks.state}, 문턱 ${ks.threshold}) · 창 시작 ${win.at(-1)?.human_graded_at ?? '—'}`)

// ── 세트 B ──
const md = fs.readFileSync('reports/2026-11-16/t2-content-guard-v71cp.md', 'utf8')
const bIds = [...md.matchAll(/^- \d+\. ([0-9a-f-]{36})\b/gm)].map((m) => m[1])
if (bIds.length !== 20) die(`세트 B: v71cp 문서에서 input_id ${bIds.length}개를 읽었다(기대 20)`)
const bRows = await pageAll(() => sb.from('review_relevance_verdicts').select('input_id, project_id, human_verdict, human_product_informative').in('input_id', bIds))
if (bRows.length !== 20) die(`세트 B: 판정 행 ${bRows.length}/20 건만 읽힘`)
const bGraded = bRows.filter((r) => r.human_verdict != null).length
const bInfo = bRows.filter((r) => typeof r.human_product_informative === 'boolean').length
console.log(`세트 B: 20건 · 사람 관련 칸 채점 ${bGraded} · 정보 칸 채점 ${bInfo} (둘 다 20 이어야 정밀도에 들어간다)`)

// ── 세트 C ──
const newSince = opt('new-since') ?? '2026-11-18'
const sinceIso = /^\d{4}-\d{2}-\d{2}$/.test(newSince) ? `${newSince}T00:00:00+09:00` : newSince
if (!Number.isFinite(Date.parse(sinceIso))) die(`--new-since 를 읽지 못했다: ${newSince}`)
const onlySources = opt('sources') ? new Set(opt('sources').split(',').map((s) => s.trim()).filter(Boolean)) : null
const taken = new Set([...win.map((r) => r.input_id), ...bIds])
const cand = (await pageAll(() => sb.from('review_relevance_verdicts')
  .select('input_id, project_id, verdict, second_verdict, product_informative, second_product_informative')
  .is('human_verdict', null).eq('verdict', 'relevant').eq('second_verdict', 'relevant')
  .eq('product_informative', true).eq('second_product_informative', true).gte('judged_at', sinceIso)))
  .filter((r) => meetsRrV2(r) && !taken.has(r.input_id))
const src = new Map()
for (let i = 0; i < cand.length; i += 200) {
  const ids = cand.slice(i, i + 200).map((r) => r.input_id)
  const { data, error } = await sb.from('analysis_inputs').select('id, source_key').in('id', ids)
  if (error) die(`세트 C 소스 조회 실패: ${error.message}`)
  for (const x of data) src.set(x.id, x.source_key)
}
if (src.size !== cand.length) die(`세트 C: 원문 행 ${src.size}/${cand.length}건만 읽힘(§7.1)`)
const pool = cand.map((r) => ({ ...r, source_key: src.get(r.input_id) })).filter((r) => !onlySources || onlySources.has(r.source_key))
const seed = Number(opt('seed') ?? 20261119)
const cRows = pickPerSource(pool, { total: 30, perSource: 8, seed })
const cPer = cRows.reduce((m, r) => ({ ...m, [r.source_key]: (m[r.source_key] ?? 0) + 1 }), {})
console.log(`세트 C: 후보 ${pool.length}건(since ${sinceIso}${onlySources ? ` · 소스 ${[...onlySources].join(',')}` : ' · 소스 전부'}) → ${cRows.length}건 ${JSON.stringify(cPer)}`)
if (cRows.length < 30) console.warn(`⚠️ 세트 C 가 30건에 못 미친다(${cRows.length}) — 소스당 8 상한 또는 후보 부족. 상한을 올리지 말고 그대로 보고한다.`)

const out = opt('out') ?? 'ops/state/t2-eval/resample-2026-11-19.json'
fs.mkdirSync(path.dirname(out), { recursive: true })
const rows = [
  ...win.map((r) => ({ input_id: r.input_id, project_id: r.project_id, set: 'A' })),
  ...bRows.map((r) => ({ input_id: r.input_id, project_id: r.project_id, set: 'B' })),
  ...cRows.map((r) => ({ input_id: r.input_id, project_id: r.project_id, set: 'C' })),
]
fs.writeFileSync(out, JSON.stringify(rows, null, 1))
console.log(`✅ ${out} — ${rows.length}행 (A ${win.length} · B ${bRows.length} · C ${cRows.length})`)
