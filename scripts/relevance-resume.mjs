#!/usr/bin/env node
// 판정 체인 자동 재개 게이트(남헌 v67 §2-1-5) — .github/workflows/relevance-resume.yml 이 수동(workflow_dispatch)으로만 부른다 — 남헌 승인 환경·RELEVANCE_RESUME_ENABLED 필요.
// 하는 일: agent_runs 의 최근 relevance-judge 행으로 relevanceResumeDecision 을 돌려 GITHUB_OUTPUT 에 resume·hop·zero·reason 을 남긴다. DB 쓰기 없음.
// 쉬는 조건(= resume=false): RELEVANCE_CHAIN=off · relevance_cap_until 없음/만료 · 이력 조회 실패 · 결정 함수가 쉬라고 함.
// 이어받기: 직전 실행이 "이어 가라"(chain.relaunch=true)를 남겼으면 그 hop·연속 0건을 넘겨 카운터가 리셋되지 않게 한다(chainCarryOf).
import fs from 'node:fs'
import { createClient } from '../lib/supabase/server.ts'
import { QUOTA_COOLDOWN_MS } from '../lib/analysis/extract-auto.ts'
import { chainCarryOf } from '../lib/analysis/relevance-judge-all.ts'
import { loadGuardConfig, loadRecentRuns, relevanceResumeDecision } from '../lib/analysis/session-guard.ts'

const out = (k, v) => { if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${String(v).replace(/[\r\n]+/g, ' ')}\n`) }
const finish = (resume, reason, hop = 0, zero = 0) => {
  console.log(`[relevance-resume] ${resume ? '재개' : '쉼'} — ${reason}${resume ? ` · hop ${hop} · 연속 0건 ${zero}` : ''}`)
  out('resume', resume ? 'true' : 'false'); out('hop', hop); out('zero', zero); out('reason', reason)
  process.exit(0)
}

if ((process.env.RELEVANCE_CHAIN ?? 'on').trim().toLowerCase() === 'off') finish(false, '리포 변수 RELEVANCE_CHAIN=off')
const { cfg } = loadGuardConfig()
const now = new Date()
if (cfg.relevanceCapUntilMs == null || now.getTime() >= cfg.relevanceCapUntilMs) finish(false, 'relevance_cap_until 없음/만료 — 체인 꺼짐')
const supabase = await createClient()
if (!supabase) finish(false, 'DB 연결 실패 — 모른 채 재개하지 않는다')
const rows = await loadRecentRuns(supabase, now)
if (!rows) finish(false, '실행 이력 조회 실패 — 모른 채 재개하지 않는다')
const d = relevanceResumeDecision(rows, { now, cooldownMs: QUOTA_COOLDOWN_MS })
if (!d.run) finish(false, d.reason)
const carry = chainCarryOf(rows, now)
finish(true, d.reason, carry?.hop ?? 0, carry?.zero ?? 0)
