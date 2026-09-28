#!/usr/bin/env node
// 경쟁사 프로필 백필 — 이미 추출된 프로젝트에 현재 프롬프트 버전의 스냅샷이 없으면 만든다.
//
//   node --env-file=.env.local scripts/competitor-profile-backfill.mjs                 # --dry 기본: 대상만 나열, LLM·DB 쓰기 없음
//   node --env-file=.env.local scripts/competitor-profile-backfill.mjs --run --limit 3   # 실제 생성(LLM 호출·행 INSERT)
//   node --env-file=.env.local scripts/competitor-profile-backfill.mjs --run --project <uuid> [--force]
//
// 대상: analysis_projects.status 가 추출 뒤 단계(extracted/reviewed/scored/angled/done)이고 원문이 남아 있는 프로젝트 중
//       최신 스냅샷의 prompt_version 이 코드와 다른 것(needsProfile). failed 스냅샷도 "있음"이다 — 다시 시도는 --force.
// 실행 기록: agent_runs run_key `competitor-profile-backfill-<KST날짜>-<epoch>` (dept cto). 프로젝트당 스텝 1개 — extract-auto 의
//       profile-* 스텝과 같은 detail(seconds·cost_usd) 이라 주간 점검이 같은 열로 센다.
// 종료코드: 0 정상(대상 0건 포함) · 1 한도 blocked · 2 설정/조회 실패 · 3 생성 실패 1건 이상
//
// ⚠️ 서브에이전트에 서비스키를 넘기지 않는다(CLAUDE.md §10.1) — 오케스트레이터가 직접 돌린다.

import { createClient } from '../lib/supabase/server.ts'
import { requiredKeyFor, resolveProvider } from '../lib/analysis/llm.ts'
import { PROFILE_PROMPT_VERSION, needsProfile } from '../lib/analysis/competitor-profile.ts'
import { generateCompetitorProfile } from '../lib/analysis/competitor-profile-db.ts'
import { createTracker } from './agent-status.mjs'
import { kstDate } from './notion-status-log.mjs'

const args = process.argv.slice(2)
const flag = (n) => args.includes(`--${n}`)
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null }
const run = flag('run')
const dry = !run || flag('dry')
const force = flag('force')
const onlyProject = opt('project')
const limit = Number(opt('limit') ?? (onlyProject ? 1 : 5))
if (!Number.isInteger(limit) || limit < 1) { console.error('--limit 는 1 이상 정수'); process.exit(64) }

const DONE_STATUSES = ['extracted', 'reviewed', 'scored', 'angled', 'done']
const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`)

const provider = resolveProvider()
const requiredKey = requiredKeyFor(provider)
if (!dry && requiredKey && !process.env[requiredKey]) {
  console.error(`✗ ${requiredKey} 가 없다(provider=${provider}). 생성을 시작하지 않는다.`)
  process.exit(2)
}
const supabase = await createClient()
if (!supabase) { console.error('✗ DB 연결 실패 — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 확인'); process.exit(2) }

log(`경쟁사 프로필 백필 ${dry ? '(--dry: 대상 나열만)' : '(--run)'} — provider=${provider} · 버전 ${PROFILE_PROMPT_VERSION} · 상한 ${limit}건${force ? ' · --force' : ''}`)

// ── 1. 후보 ─────────────────────────────────────────────────────
let q = supabase.from('analysis_projects').select('id, status, product_elevator_pitch, business_model, extract_finished_at').in('status', DONE_STATUSES)
if (onlyProject) q = q.eq('id', onlyProject)
const { data: projects, error: pErr } = await q.order('extract_finished_at', { ascending: false, nullsFirst: false })
if (pErr) { console.error(`✗ 프로젝트 조회 실패: ${pErr.message}`); process.exit(2) }
if (!projects || projects.length === 0) { log(onlyProject ? `대상 프로젝트가 추출 뒤 상태가 아니거나 없다: ${onlyProject}` : '후보 0건'); process.exit(0) }

// ── 2. 최신 스냅샷 — 테이블 없음(마이그 미적용)은 "없음"이 아니라 중단이다(§7.1) ──
const { data: snaps, error: sErr } = await supabase
  .from('competitor_profile_snapshots').select('project_id, prompt_version, status, created_at')
  .in('project_id', projects.map((p) => p.id)).order('created_at', { ascending: false })
if (sErr) {
  console.error(`✗ 스냅샷 조회 실패(${sErr.code ?? ''}): ${sErr.message}${['42P01', 'PGRST205'].includes(sErr.code) ? ' — 마이그 20260930000037 미적용' : ''}`)
  process.exit(2)
}
const latestBy = new Map()
for (const s of snaps ?? []) if (!latestBy.has(s.project_id)) latestBy.set(s.project_id, s)

const targets = []
let skippedCurrent = 0
for (const p of projects) {
  const latest = latestBy.get(p.id) ?? null
  if (!force && !needsProfile(latest)) { skippedCurrent += 1; continue }
  targets.push({ ...p, latest })
}
const picked = targets.slice(0, limit)
log(`후보 ${projects.length}건 → 현재 버전 있음 ${skippedCurrent}건 제외 → 대상 ${targets.length}건, 이번 ${picked.length}건`)
for (const p of picked) {
  log(`  · ${p.id} [${p.business_model ?? '미기재'}] ${p.status} · 기존 ${p.latest ? `${p.latest.prompt_version}/${p.latest.status}` : '없음'} — ${p.product_elevator_pitch ?? '(소개 없음)'}`)
}
if (dry) { log('--dry: 여기서 끝낸다. LLM 호출·DB 쓰기 없음.'); process.exit(0) }
if (picked.length === 0) process.exit(0)

// ── 3. 생성 ─────────────────────────────────────────────────────
const tracker = await createTracker({ runKey: `competitor-profile-backfill-${kstDate()}-${Date.now()}`, dept: 'cto', trigger: process.env.GITHUB_ACTIONS ? 'manual' : 'local' })
let ok = 0, failed = 0, blocker = null
for (const p of picked) {
  const out = await generateCompetitorProfile(supabase, p.id, provider, { trigger: 'backfill' })
  const status = out.status === 'failed' ? 'failed' : out.status === 'skipped' ? 'skipped' : 'ok'
  if (status === 'ok') ok += 1; else if (status === 'failed') failed += 1
  log(`${status === 'ok' ? '✓' : '✗'} ${p.id} ${out.status} ${Math.round(out.durationMs / 1000)}s — 주장 ${out.claims}개 · 버림 ${out.droppedClaims}개 · 입력 ${out.inputs}건 · model=${out.model ?? '-'} · cost=${out.costUsd ?? 'n/a'}${out.reason ? ` (${out.reason})` : ''}`)
  await tracker.step({
    stepKey: `profile-${p.id}`, label: `경쟁사 프로필 ${p.id}`, status: out.quotaExhausted ? 'blocked' : status,
    blocker: out.quotaExhausted ? `LLM 한도 — ${out.reason}` : null,
    counts: { claims: out.claims, dropped: out.droppedClaims, inputs: out.inputs },
    detail: { profile_status: out.status, reason: out.reason, snapshot_id: out.snapshotId, model: out.model, seconds: Math.round(out.durationMs / 1000), cost_usd: out.costUsd },
  })
  if (out.quotaExhausted) { blocker = `LLM 한도 — ${out.reason}`; console.error(`✗ 한도에 걸려 멈춘다: ${out.reason}`); break }
}
await tracker.finish({ status: blocker ? 'blocked' : failed > 0 ? (ok > 0 ? 'partial' : 'failed') : 'ok', summary: { targets: picked.length, ok, failed, remaining: targets.length - picked.length, blocker } })
log(`끝 — 생성 ${ok}건 · 실패 ${failed}건 · 남은 대상 ${targets.length - picked.length}건`)
if (!tracker.dbOk) console.log('⚠️ 실행 상태를 agent_runs 에 남기지 못했다 — ops/state 폴백')
process.exit(blocker ? 1 : failed > 0 ? 3 : 0)
