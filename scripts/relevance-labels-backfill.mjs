#!/usr/bin/env node
// T2 라벨 소급 — 라벨 도입(마이그 20260930000014, PR #257) 전에 판정된 행에 라벨 4개만 채운다.
//
// 왜: relevance-judge-auto.mjs 의 pendingFor() 는 이미 판정된 input_id 를 건너뛴다. 그래서
//     라벨 도입 전 판정 행(2026-09-25 CEO-STAFF 실측 860행)은 영영 라벨이 안 붙고,
//     공개 3열(/signals/community)·페인 카드(/signals/card)가 빈 화면으로 남는다.
//
// 무엇을 하나
//   1. review_relevance_verdicts 에서 라벨 4개(impact·frequency·community_signal·wtp_mentioned)가
//      **전부 NULL** 이고 원문이 폐기되지 않은 행을 고른다. 기본은 공개 화면에 나오는 행
//      (사람 채점 relevant, 또는 사람 채점 없음 + LLM relevant)만 — `--all` 이면 판정 무관 전부.
//   2. 프로젝트별로 20건씩 judgeRelevanceBatch 를 다시 부른다(판정 프롬프트 한 벌 — 라벨만 따로
//      묻는 두 번째 프롬프트를 만들지 않는다).
//   3. **라벨 4개만 UPDATE** 한다. verdict·reason·model·judged_at·human_* 는 payload 에 없다.
//      UPDATE 조건에 "라벨 4개 전부 NULL" 을 다시 건다 — 그사이 야간 판정이 라벨을 채웠으면 덮지 않는다.
//
// 지키는 것
//   · 비용: withLlmBudget(프로젝트 1건 = 1지갑) + 일 예산(lib/analysis/budget.ts). 429/503/예산이면
//     그 자리에서 멈추고 남은 건수를 남긴다(§7.2) — relevance-judge-auto.mjs 와 같은 부품이다.
//   · 모델이 라벨을 전부 null 로 준 행은 쓰지 않는다(쓸 게 없다). 건수로 보고한다.
//     ponytail: "모델이 모른다고 답함"을 표시할 컬럼이 없어서, 그런 행은 다음 실행에 다시 대상이 된다.
//     반복 비용이 문제가 되면 labels_attempted_at 컬럼(마이그)을 붙인다.
//   · 새 판정이 저장된 verdict 와 달라도 verdict 는 그대로 둔다. 불일치 건수만 적는다(판정 안정성 신호).
//   · 이 스크립트는 **대량 UPDATE** 다. 실행 여부는 사람(CEO-STAFF/남헌)이 정한다 — 무인 루프에 걸지 않는다.
//
// 사용:
//   node --env-file=.env.local scripts/relevance-labels-backfill.mjs          # 기본 = --dry (대상 선정만)
//   node --env-file=.env.local scripts/relevance-labels-backfill.mjs --run    # 실제 LLM 호출 + UPDATE
//   옵션: --all (판정 무관 전부) · --limit N (이번 실행 최대 행 수)
//
// 종료코드: 0 정상(대상 0건·한도 도달 포함) · 2 설정/조회 실패 · 3 저장 실패 1건 이상

import { createClient } from '../lib/supabase/server.ts'
import { requiredKeyFor, resolveProvider } from '../lib/analysis/llm.ts'
import { withLlmBudget, DAILY_BUDGET_USD, dailySpent } from '../lib/analysis/budget.ts'
import { BATCH_SIZE, MAX_REVIEW_CHARS, chunkReviews, judgeRelevanceBatch } from '../lib/analysis/relevance-judge.ts'
import fs from 'node:fs'
import { kstDate, recordStatusLog } from './notion-status-log.mjs'

const args = process.argv.slice(2)
const run = args.includes('--run')
const all = args.includes('--all')
const limitArg = Number(args[args.indexOf('--limit') + 1])
const limit = args.includes('--limit') && Number.isInteger(limitArg) && limitArg > 0 ? limitArg : Infinity
const LABEL_KEYS = ['impact', 'frequency', 'community_signal', 'wtp_mentioned']

const log = (m) => console.log(`[${new Date().toISOString()}] ${m}`)

const provider = resolveProvider()
const requiredKey = requiredKeyFor(provider)
if (run && requiredKey && !process.env[requiredKey]) {
  console.error(`✗ ${requiredKey} 가 없다(provider=${provider}). 시작하지 않는다.`)
  process.exit(2)
}
if (run && provider === 'mock') {
  // mock 은 라벨을 전부 null 로 돌려준다 — 돌려도 쓰는 행이 0 이다. 헛돈 것을 성공으로 보고하지 않는다.
  console.error('✗ provider=mock — 라벨을 만들 수 없다. 실제 프로바이더로 실행하라.')
  process.exit(2)
}

const supabase = await createClient()
if (!supabase) {
  console.error('✗ DB 연결 실패 — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 확인')
  process.exit(2)
}

log(`라벨 소급 ${run ? '(--run: LLM 호출 + UPDATE)' : '(--dry: 대상 선정만)'} — 범위 ${all ? '판정 무관 전부' : '공개 대상(relevant)만'} · provider=${provider} · 일 예산 $${DAILY_BUDGET_USD}`)

// ── 1. 대상 선정 (페이지로 끝까지 읽는다 — PostgREST 기본 상한 1000행에 잘리지 않게) ──
const rows = []
for (let from = 0; ; from += 1000) {
  let q = supabase
    .from('review_relevance_verdicts')
    .select('input_id, project_id, verdict, human_verdict, analysis_inputs!inner(raw_text, purged_at)')
    .is('impact', null).is('frequency', null).is('community_signal', null).is('wtp_mentioned', null)
    .order('input_id')
    .range(from, from + 999)
  if (!all) q = q.or('human_verdict.eq.relevant,and(human_verdict.is.null,verdict.eq.relevant)')
  const { data, error } = await q
  if (error) {
    console.error(`✗ 대상 조회 실패: ${error.code ?? ''} ${error.message}`)
    process.exit(2)
  }
  rows.push(...data)
  if (data.length < 1000) break
}

const purged = rows.filter((r) => r.analysis_inputs.purged_at || !r.analysis_inputs.raw_text)
const eligible = rows.filter((r) => !purged.includes(r)).slice(0, limit)
const byProject = new Map()
for (const r of eligible) {
  if (!byProject.has(r.project_id)) byProject.set(r.project_id, [])
  byProject.get(r.project_id).push(r)
}
const calls = [...byProject.values()].reduce((n, rs) => n + Math.ceil(rs.length / BATCH_SIZE), 0)

log(`라벨 전부 NULL ${rows.length}행 → 원문 폐기로 제외 ${purged.length}행 → 대상 ${eligible.length}행` +
  (Number.isFinite(limit) ? ` (--limit ${limit})` : '') +
  ` · 프로젝트 ${byProject.size}건 · 예상 호출 ${calls}회(${BATCH_SIZE}건씩)`)

if (!run) {
  log('--dry: 여기서 끝낸다. LLM 호출·DB 쓰기 없음. 실행은 --run.')
  process.exit(0)
}

// ── 2. 프로젝트 목적 (판정 때와 같은 입력 — reader_problem 이 없으면 42703 폴백) ──
const ids = [...byProject.keys()]
let { data: projects, error: pErr } = await supabase
  .from('analysis_projects').select('id, product_elevator_pitch, purpose, reader_problem').in('id', ids)
if (pErr?.code === '42703') {
  log('⚠️ analysis_projects.reader_problem 컬럼 없음(42703) — 목적은 제품 소개로 내려간다')
  ;({ data: projects, error: pErr } = await supabase
    .from('analysis_projects').select('id, product_elevator_pitch, purpose').in('id', ids))
}
if (pErr) {
  console.error(`✗ 프로젝트 조회 실패: ${pErr.message}`)
  process.exit(2)
}
const projectById = new Map((projects ?? []).map((p) => [p.id, p]))

// ── 3. 프로젝트별 소급 ───────────────────────────────────────────
let written = 0
let noLabels = 0
let raced = 0
let mismatch = 0
let saveFailed = 0
let blocker = null
let done = 0

for (const [projectId, rs] of byProject) {
  const project = projectById.get(projectId) ?? null
  const batches = chunkReviews(
    rs.map((r) => ({ input_id: r.input_id, text: r.analysis_inputs.raw_text.slice(0, MAX_REVIEW_CHARS), stored: r.human_verdict ?? r.verdict })),
    BATCH_SIZE,
  )
  await withLlmBudget(async () => {
    for (const batch of batches) {
      const out = await judgeRelevanceBatch(project, batch)
      if (out.quotaExhausted) {
        blocker = out.error ?? '한도/예산 소진'
        return
      }
      if (out.error) {
        // 호출·파싱 실패 = 라벨 전부 null. 쓸 게 없다 — 다음 실행에서 다시 대상이 된다.
        log(`⚠️ ${projectId} 묶음 실패(${out.error}) — ${batch.length}건 건너뜀`)
        noLabels += batch.length
        done += batch.length
        continue
      }
      for (const v of out.verdicts) {
        done += 1
        const stored = batch.find((b) => b.input_id === v.input_id)?.stored
        if (v.verdict !== 'unknown' && stored && v.verdict !== stored) mismatch += 1
        const labels = Object.fromEntries(LABEL_KEYS.map((k) => [k, v[k]]))
        if (LABEL_KEYS.every((k) => labels[k] === null)) {
          noLabels += 1
          continue
        }
        const { data, error } = await supabase
          .from('review_relevance_verdicts')
          .update(labels)
          .eq('input_id', v.input_id)
          .is('impact', null).is('frequency', null).is('community_signal', null).is('wtp_mentioned', null)
          .select('input_id')
        if (error) {
          saveFailed += 1
          console.error(`✗ ${v.input_id} 라벨 저장 실패: ${error.code ?? ''} ${error.message}`)
          continue
        }
        // 0행 갱신 = 그사이 다른 실행이 라벨을 채웠다. 덮지 않았다는 뜻이고 실패가 아니다.
        if ((data ?? []).length === 0) raced += 1
        else written += 1
      }
    }
  })
  if (blocker) break
}

const spent = dailySpent()
if (blocker) log(`⚠️ 멈췄다 — ${done}/${eligible.length}행 처리 후. 사유: ${blocker}. 남은 ${eligible.length - done}행은 다음 실행.`)
log(`끝 — 라벨 기록 ${written}행 · 모델이 라벨 못 줌 ${noLabels}행 · 이미 채워져 건너뜀 ${raced}행 · ` +
  `저장 실패 ${saveFailed}행 · 저장 verdict 와 새 판정 불일치 ${mismatch}행(verdict 는 안 바꿈) · ` +
  `추정 $${spent.spentUsd.toFixed(3)}(상한 $${DAILY_BUDGET_USD})`)
// 멈춤·저장 실패 사유를 콘솔 밖에도 남긴다 — 2026-09-25 소급이 93/602 에서 멈췄는데 사유가 남헌 터미널에만
// 있어 아무도 확인하지 못했다. 파일(ops/state)은 항상, Notion 행은 토큰이 있을 때(없으면 status-log-pending 폴백).
if (blocker || saveFailed > 0) {
  const why = blocker ? `멈춤 ${done}/${eligible.length}행 — ${blocker}` : `저장 실패 ${saveFailed}행`
  fs.mkdirSync('ops/state', { recursive: true })
  fs.appendFileSync('ops/state/relevance-labels-backfill.jsonl', JSON.stringify({ at: new Date().toISOString(), done, eligible: eligible.length, written, noLabels, saveFailed, blocker }) + '\n')
  const w = await recordStatusLog({
    date: kstDate(), track: '기타', done: `T2 라벨 소급 — 라벨 기록 ${written}행 · 처리 ${done}/${eligible.length}행`,
    blocked: why, next: `남은 ${eligible.length - done}행은 같은 명령 --run 으로 이어서 처리`, needsHuman: false,
    note: 'scripts/relevance-labels-backfill.mjs 자동 기록 · ops/state/relevance-labels-backfill.jsonl',
  }, { pendingDir: 'ops/state/status-log-pending' })
  log(w.ok ? `사유 기록: ops/state/relevance-labels-backfill.jsonl + Notion ${w.title}` : `사유 기록: ops/state/relevance-labels-backfill.jsonl · Notion 실패(${w.stage}: ${w.error})${w.pendingPath ? ` → ${w.pendingPath}` : ''}`)
}
process.exit(saveFailed > 0 ? 3 : 0)
