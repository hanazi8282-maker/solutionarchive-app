#!/usr/bin/env node
// 운영자용 추출(Stage1+Stage2) 실행 CLI — 라우트 `/api/analyze/extract` 와 같은 한 벌을 돈다.
//
//   node --env-file=.env.local scripts/analyze-extract-run.mjs --project <uuid>            # 시작
//   node --env-file=.env.local scripts/analyze-extract-run.mjs --project <uuid> --force    # 재분석(기존 aspects 교체)
//   node --env-file=.env.local scripts/analyze-extract-run.mjs --project <uuid> --dry      # 잠금 없이 시작 가능 여부만
//
// 왜 있나(2026-09-20): `/api/analyze/extract` 는 Google 허용목록 로그인 뒤에 있어 세션 없이 부를 수 없다.
// "누적 리뷰 최다 프로젝트에 추출을 돌려라" 같은 운영 지시를 받을 자리가 없었다. 프롬프트·잠금·저장 규칙은
// `lib/analysis/extract-run.ts` 한 곳이고, 이 파일은 그걸 호출해 결과를 종료코드로 옮길 뿐이다.
//
// 종료코드: 0 성공 · 2 잠금 실패(409/404/400/500 — 사유를 그대로 찍는다) · 3 추출 실패(status=failed 로 기록됨)
//
// ⚠️ 이 스크립트는 LLM 을 호출한다(비용). --dry 는 호출하지 않는다.
// ⚠️ 서브에이전트에 서비스키를 넘기지 않는다(CLAUDE.md §10.1) — 오케스트레이터가 직접 돌린다.

import { createClient } from '../lib/supabase/server.ts'
import { requiredKeyFor, resolveProvider } from '../lib/analysis/llm.ts'
import { withLlmBudget } from '../lib/analysis/budget.ts'
import { canStart } from '../lib/analysis/extract-gate.ts'
import { claimExtraction, runExtraction } from '../lib/analysis/extract-run.ts'

const args = process.argv.slice(2)
const flag = (n) => args.includes(`--${n}`)
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null }

const projectId = opt('project')
if (!projectId) { console.error('사용법: --project <uuid> [--force] [--dry]'); process.exit(64) }
const force = flag('force')
const dry = flag('dry')

const provider = resolveProvider()
const requiredKey = requiredKeyFor(provider)
if (requiredKey && !process.env[requiredKey]) {
  console.error(`✗ ${requiredKey} 가 없다(provider=${provider}). .env.local 을 확인하라.`)
  process.exit(2)
}

const supabase = await createClient()
if (!supabase) { console.error('✗ DB 연결 실패 — SUPABASE_URL/SERVICE_ROLE_KEY 확인'); process.exit(2) }

const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`)

// 현재 상태를 먼저 보여준다 — 무엇을 덮어쓰는지 사람이 알고 시작해야 한다.
const { data: before, error: beforeErr } = await supabase
  .from('analysis_projects')
  .select('id, status, extract_started_at, extract_attempts, maturity_stage, product_elevator_pitch')
  .eq('id', projectId)
  .maybeSingle()
if (beforeErr) { console.error(`✗ 프로젝트 조회 실패: ${beforeErr.message}`); process.exit(2) }
if (!before) { console.error(`✗ 프로젝트 없음: ${projectId}`); process.exit(2) }

const { count: inputCount, error: inputErr } = await supabase
  .from('analysis_inputs').select('id', { count: 'exact', head: true }).eq('project_id', projectId)
if (inputErr) { console.error(`✗ 원문 수 조회 실패: ${inputErr.message}`); process.exit(2) }
const { count: aspectCount, error: aspectErr } = await supabase
  .from('analysis_aspects').select('id', { count: 'exact', head: true }).eq('project_id', projectId)
if (aspectErr) { console.error(`✗ 속성 수 조회 실패: ${aspectErr.message}`); process.exit(2) }

log(`프로젝트 ${projectId}`)
log(`  ${before.product_elevator_pitch ?? '(소개 없음)'}`)
log(`  상태 ${before.status} · 시도 ${before.extract_attempts ?? 0} · 성숙도 ${before.maturity_stage ?? '미판정'} · 원문 ${inputCount ?? '?'}건 · 기존 속성 ${aspectCount ?? '?'}개`)
log(`  provider=${provider} force=${force} dry=${dry}`)

const verdict = canStart(before.status, before.extract_started_at, force)
if (!verdict.ok) { console.error(`✗ 시작 불가: ${verdict.reason}`); process.exit(2) }
if (dry) { log('--dry: 시작 가능. 잠금·LLM 호출 없이 끝낸다.'); process.exit(0) }

const claim = await claimExtraction(supabase, projectId, force)
if (!claim.ok) { console.error(`✗ 잠금 실패(${claim.httpStatus}): ${claim.error}`); process.exit(2) }
log(`잠금 획득 — 시도 ${claim.attempts} · 원문 ${claim.inputCount}건 · ${claim.isReanalysis ? '재분석(기존 속성 교체)' : '첫 추출'}`)

const t0 = Date.now()
const out = await withLlmBudget(() => runExtraction(supabase, projectId, provider))
if (!out.ok) { console.error(`✗ 추출 실패(${Math.round((Date.now() - t0) / 1000)}s): ${out.error} — analysis_projects.status=failed 로 기록됨`); process.exit(3) }
log(`✓ 추출 완료 ${Math.round((Date.now() - t0) / 1000)}s — 속성 ${out.aspects}개 · 입력 ${out.inputs}건${out.skippedInputs ? ` · 상한으로 제외 ${out.skippedInputs}건` : ''} · model=${out.model}`)

// 양성 확인 — 도구가 준 ok 만 믿지 않는다(§7.1). DB 를 다시 읽는다.
const { data: after, error: afterErr } = await supabase
  .from('analysis_projects').select('status, maturity_stage, maturity_notes, m_meta_signal, extract_finished_at').eq('id', projectId).single()
if (afterErr || !after) { console.error(`✗ 사후 확인 실패: ${afterErr?.message ?? 'no row'}`); process.exit(3) }
log(`사후 확인 — 상태 ${after.status} · 성숙도 ${after.maturity_stage} (${after.maturity_notes ?? ''}) · 메타신호 ${after.m_meta_signal}`)
process.exit(after.status === 'extracted' ? 0 : 3)
