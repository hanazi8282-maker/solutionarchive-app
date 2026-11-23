#!/usr/bin/env node
// 점진 해제 단계 통과 판정(v71dc) — gradual-release-sample.mjs 가 쓴 표본의 사람 채점을 DB 에서 읽어 오류를 센다. 읽기 전용.
//
//   node --env-file=.env.local scripts/gradual-release-judge.mjs reports/<날짜>/gradual-release-stage1-sample.md [--print-stage-up]
//
// 판정(lib/analysis/gradual-release.ts judgeStage, 오류 = scoreApproval 과 같은 정의 — 사람 무관 또는 정보없음):
//   통과 = 채점 30건 이상 ∧ 오류 ≤4 · 멈춤 = 오류 ≥5 · 확인 불가 = 채점 30건 미만.
// --print-stage-up: 통과이고 단계가 하루 이상 지났을 때만 다음 단계로 올리는 `gh variable set` 두 줄을 **출력**한다.
//   이 스크립트는 그 명령을 실행하지 않는다 — 단계를 올리는 것은 남헌만 한다.
//
// 종료코드: 0 판정 출력(통과·멈춤·확인 불가 모두) · 2 조회 실패 · 64 사용법 오류

import { readFileSync } from 'node:fs'
import { createClient } from '../lib/supabase/server.ts'
import { AUTO_APPROVAL_RULE } from '../lib/analysis/auto-approval.ts'
import { GRADUAL, judgeStage, parseStageSince } from '../lib/analysis/gradual-release.ts'
import { kstDate } from './notion-status-log.mjs'

const args = process.argv.slice(2)
const path = args.find((a) => !a.startsWith('--'))
const printUp = args.includes('--print-stage-up')
if (!path) { console.error('사용법: scripts/gradual-release-judge.mjs <표본.md> [--print-stage-up]'); process.exit(64) }
let md
try { md = readFileSync(path, 'utf8') } catch (e) { console.error(`✗ 파일을 읽지 못했다: ${e.message}`); process.exit(64) }

const head = /<!-- gradual-release stage=([1-5]) since=(\d{4}-\d{2}-\d{2}(?:T[0-9:.]+Z)?) until=(\d{4}-\d{2}-\d{2})/.exec(md)
if (!head) { console.error('✗ 점진 해제 표본 머리 주석이 없다 — gradual-release-sample.mjs 가 쓴 파일이 아니다'); process.exit(64) }
const [, stageStr, since, until] = head
// 단계 시작 = KST 날짜(그날 00:00 KST) 또는 ISO UTC 시각 — 승인 스크립트와 같은 해석(parseStageSince).
const sinceAt = parseStageSince(since, kstDate(), new Date())
if (!sinceAt) { console.error(`✗ 머리 주석 since=${since} 를 읽지 못했다(미래이거나 형식 오류)`); process.exit(64) }
const stage = Number(stageStr)
const UUID = /`([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})`\s*\|\s*$/i
const keys = [...new Set(md.split(/\r?\n/).map((l) => UUID.exec(l)?.[1]).filter(Boolean))]
if (keys.length === 0) { console.error('✗ 표에 키(uuid)가 없다'); process.exit(64) }

const sb = await createClient()
if (!sb) { console.error('✗ DB 연결 실패 — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 확인'); process.exit(2) }
const rows = []
for (let i = 0; i < keys.length; i += 200) {
  const { data, error } = await sb.from('review_relevance_verdicts')
    .select('input_id, auto_approval_rule, auto_approved_at, human_verdict, human_product_informative, human_graded_at').in('input_id', keys.slice(i, i + 200))
  if (error) { console.error(`✗ 채점 조회 실패: ${error.message}`); process.exit(2) }
  rows.push(...(data ?? []))
}
const missing = keys.filter((k) => !rows.some((r) => r.input_id === k))
// rr-v2 자동 승인 행만 센다 — 다른 행이 섞였으면 그 표본은 이 단계의 것이 아니다.
const foreign = rows.filter((r) => r.auto_approval_rule !== AUTO_APPROVAL_RULE || !r.auto_approved_at)
const j = judgeStage(rows.filter((r) => !foreign.includes(r)))
const label = { pass: '통과', stop: '멈춤', insufficient: '확인 불가(채점 부족)' }[j.state]

console.log(`점진 해제 ${stage}단계 표본 ${path} (${since}~${until}) — 키 ${keys.length}건 · DB 행 ${rows.length}건`)
if (missing.length) console.log(`  ⚠️ 판정 행이 없는 키 ${missing.length}건(다른 DB 의 표인가): ${missing.slice(0, 5).join(', ')}`)
if (foreign.length) console.log(`  ⚠️ rr-v2 자동 승인 행이 아닌 키 ${foreign.length}건 — 셈에서 뺐다`)
console.log(`판정: ${label} — ${j.reason}`)

// 참고: 승인 스크립트는 이 단계(since 이후) 승인 글 전체의 사람 채점 오류가 ${GRADUAL.maxErrors + 1}건 이상이면 승인을 멈춘다(표본 밖 감사 채점 포함).
const stageRows = []
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from('review_relevance_verdicts').select('human_verdict, human_product_informative, human_graded_at')
    .eq('auto_approval_rule', AUTO_APPROVAL_RULE).gte('auto_approved_at', sinceAt.toISOString())
    .not('human_verdict', 'is', null).order('input_id').range(from, from + 999)
  if (error) { console.log(`  ⚠️ 단계 전체 채점 조회 실패(참고 수치라 판정은 그대로): ${error.message}`); break }
  stageRows.push(...data)
  if (data.length < 1000) break
}
const wide = judgeStage(stageRows)
console.log(`참고: ${since} 이후 단계 전체 채점 ${wide.scored}건 · 오류 ${wide.errors}건${wide.errors > GRADUAL.maxErrors ? ' — 승인 스크립트가 이미 이 단계 승인을 멈춘다' : ''}`)

if (j.state === 'stop') console.log(`멈춤 — 승인 스크립트는 다음 실행부터 0건이다(단계 전체 오류 ≥${GRADUAL.maxErrors + 1}). 완전히 끄려면: gh variable set GRADUAL_RELEASE_ENABLED --body false`)

if (printUp) {
  const today = kstDate()
  if (j.state !== 'pass') console.log('--print-stage-up: 통과가 아니라 올리는 명령을 내지 않는다.')
  else if (stage >= 5) console.log('--print-stage-up: 이미 5단계(상한 없음)다.')
  else if (since.slice(0, 10) >= today) console.log(`--print-stage-up: 단계 시작일 ${since} 이 오늘(${today})이다 — 한 단계는 최소 하루. 내일 다시.`)
  else {
    console.log('--print-stage-up: 아래 두 줄은 남헌이 직접 실행한다(이 스크립트는 실행하지 않는다).')
    console.log(`  gh variable set GRADUAL_RELEASE_STAGE --body ${stage + 1}`)
    console.log(`  gh variable set GRADUAL_RELEASE_STAGE_SINCE --body ${today}`)
  }
}
