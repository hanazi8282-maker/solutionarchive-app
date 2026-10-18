#!/usr/bin/env node
// inventory-gauge · limit-rollback-eval · agent-status-board 셀프테스트 — 순수함수만. 네트워크·DB·env 없음.
//   1) 재고 일수: 소비형만 (활성+즉시예약)÷하루슬롯, 순환형은 null
//   2) 14일 미만 보충 제안은 한 줄씩, 차단 신호 있는 소스는 상향 대신 '보류'
//   3) 한도 변경 판정: 24h 전 pending / 신호 있으면 rollback / 요청당 신규 70% 미만 rollback / 요청 부족은 unknown(0 으로 접지 않음)
//   4) canRaise: 차단 0·사용률 90%↑·24h 변경 없음·천장 내일 때만 ok
//   5) 상태판: 24h 넘게 갱신 없으면 고장 의심, 흔적 없으면 미작동, 정적 칸은 [코드만 확인]
//   6) 정적 검사: 이 도구들은 DB 에 쓰지 않고(insert/update/delete/upsert/rpc 없음), 워크플로 permissions 는 contents: read
import assert from 'node:assert/strict'
import fs from 'node:fs'

import { gaugeBlock, proposals, stockDays } from './inventory-gauge.mjs'
import { canRaise, evaluateChange, evalBlock, llmSpendLine, rollbackNote } from './limit-rollback-eval.mjs'
import { AGENTS, statusBoard } from './agent-status-board.mjs'

let pass = 0
const t = (name, fn) => { fn(); pass++; console.log(`  ok ${name}`) }

// 1·2
const G = (k, o) => ({ source_key: k, basis: 'consumed', active: 0, reserved_due_now: 0, reserved_waiting: 0, reserved_next_due: null, level: 'ok', immediate_days: 0, ...o })
t('재고 일수: 소비형만', () => {
  assert.equal(stockDays(G('appstore', { active: 4, reserved_due_now: 8 }), 6), 2)
  assert.equal(stockDays(G('clien', { basis: 'cyclic', active: 3 }), 6), null)
})
t('보충 제안: 한 줄씩·차단이면 보류·충분하면 없음', () => {
  const gs = [G('appstore', { active: 0, reserved_waiting: 140, reserved_next_due: '2026-10-20T00:00:00Z' }), G('youtube', { active: 0 }), G('googleplay', { active: 600 })]
  const p = proposals(gs, { appstore: 6, youtube: 6, googleplay: 6 }, { youtube: 2 })
  assert.equal(p.length, 2)
  assert.match(p[0], /^appstore: 예약 140개가 간격 대기 중/)
  assert.match(p[1], /^youtube: 보충 보류 — 24h 차단·쿼터 신호 2건/)
  assert.deepEqual(proposals([G('googleplay', { active: 600 })], { googleplay: 6 }, {}), [])
  // 창문 발굴 대상이 아닌 소스에는 WINDOW 제안을 하지 않고, 타깃이 없는 소스(정책 기록 행)는 건너뛴다
  const q = proposals([G('clien', { basis: 'cyclic', active: 0, level: 'urgent' }), G('itunes_search', { basis: 'cyclic', level: 'urgent' })], { clien: 6 }, {}, (k) => k !== 'itunes_search')
  assert.equal(q.length, 1)
  assert.ok(q[0].startsWith('새 타깃 필요 1곳 — clien(활성 0): 창문 발굴 대상이 아니다'))
})
t('게이지 블록 머리줄·제안 없음 문구', () => {
  const report = { sources: [{ source_key: 'googleplay', runs_per_day: 4, tpr: 14 }] }
  const b = gaugeBlock({ date: '2026-10-19', report, gauge: { fuel_line: 'x', sources: [G('googleplay', { active: 900 })] }, blocked24: {} })
  assert.match(b, /^\[재고 게이지 2026-10-19\]/)
  assert.match(b, /없음\(14일 미만 소스 없음\)/)
})

// 3·4
const NOW = new Date('2026-10-20T06:00:00Z')
const ch = { source_key: 'github_issues', previous_cap: 60, new_cap: 120, reason: 'v71aq. 롤백 cap_base=120,target=60. 24h 재평가', applied_by: 'cc', created_at: '2026-10-19T02:00:00Z' }
const run = (iso, requests, nr, bl = 0) => ({ started_at: iso, requests, new_reviews: nr, blocked_responses: bl, quota_responses: 0 })
t('한도 판정', () => {
  assert.equal(evaluateChange({ ...ch, created_at: '2026-10-20T00:00:00Z' }, [], NOW).verdict, 'pending')
  const before = [run('2026-10-19T00:00:00Z', 60, 2600)]
  assert.equal(evaluateChange(ch, [...before, run('2026-10-19T05:00:00Z', 60, 2500)], NOW).verdict, 'keep')
  assert.equal(evaluateChange(ch, [...before, run('2026-10-19T05:00:00Z', 60, 100)], NOW).verdict, 'rollback')
  assert.equal(evaluateChange(ch, [...before, run('2026-10-19T05:00:00Z', 60, 2500, 1)], NOW).verdict, 'rollback')
  assert.equal(evaluateChange(ch, [...before, run('2026-10-19T05:00:00Z', 3, 0)], NOW).verdict, 'unknown')
})
t('롤백 안내: workflow 행은 SQL, 그 밖은 reason 인용', () => {
  assert.match(rollbackNote({ applied_by: 'workflow:x', source_key: 'clien', previous_cap: 100, new_cap: 154, reason: '' }), /SET daily_request_cap = 100 WHERE key = 'clien' AND daily_request_cap = 154/)
  assert.match(rollbackNote(ch), /롤백 cap_base=120,target=60/)
  assert.match(evalBlock({ date: 'd', items: [{ c: ch, r: { verdict: 'rollback', why: 'w' } }], raises: {} }), /롤백\(적용 안 함\)/)
})
t('canRaise', () => {
  const base = { cap: 100, requests24: 95, blocked24: 0, ceiling: 200, lastChangeAgeH: 30 }
  assert.deepEqual(canRaise(base), { ok: true, next: 200, why: '사용 95/100, 차단 0, 한 단계 100 → 200' })
  assert.equal(canRaise({ ...base, blocked24: 1 }).ok, false)
  assert.equal(canRaise({ ...base, requests24: 50 }).ok, false)
  assert.equal(canRaise({ ...base, lastChangeAgeH: 5 }).ok, false)
  assert.equal(canRaise({ ...base, ceiling: 100 }).ok, false)
})

t('LLM 사용 추정: 건수 × 단가 / 한도, [추정] 라벨', () => {
  const line = llmSpendLine({ metered24: 1000, budget: 15, usdFor: () => 0.001 })
  assert.equal(line, '- LLM 일일 사용(과금 경로 = 2차 판정 Gemini 1000건 × 보수 단가) ≈ $1.00 / 한도 $15 (7%) [추정]')
  assert.match(evalBlock({ date: 'd', items: [], raises: {}, llm: line }), /LLM 일일 사용/)
})

// 5
t('상태판', () => {
  const probes = {}
  for (const a of AGENTS) if (a.probe) probes[a.n] = { last: '2026-10-19T05:00:00Z', today: 5, yday: 3 }
  probes[1] = { last: null, today: 0, yday: 0 }
  probes[2] = { last: '2026-10-17T00:00:00Z', today: 0, yday: 0 }
  probes[3] = { error: 'boom' }
  const b = statusBoard({ date: '2026-10-19', now: new Date('2026-10-19T06:00:00Z'), probes })
  assert.match(b, /^\[에이전트 상태판 2026-10-19\]/)
  assert.match(b, /\| 1 \| 새 회사[^|]*\| 미작동 \[직접 실행 확인\] \| 없음/)
  assert.match(b, /\| 2 \| 해외[^|]*\| 고장 의심\(24h↑ 갱신 없음\) \[직접 실행 확인\]/)
  assert.match(b, /\| 3 \| 다국어[^|]*\| 확인 불가 \[직접 실행 확인 실패\][^|]*\| 확인 불가 \| 확인 불가 \| 확인 불가 \| boom/)
  assert.match(b, /\| 4 \| .*\| 작동 \[직접 실행 확인\] \| 2026-10-19T05:00Z \| 5 \| \+2 \(어제 3\)/)
  assert.match(b, /\| 5 \| 하위 게시판[^|]*\| 미구현 \[코드만 확인\]/)
  assert.equal(b.split('\n').filter((l) => /^\| \d+ \|/.test(l)).length, 16)
})

// 6
t('정적: DB 쓰기 없음·워크플로 권한', () => {
  for (const f of ['inventory-gauge', 'limit-rollback-eval', 'agent-status-board']) {
    const src = fs.readFileSync(new URL(`./${f}.mjs`, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '')
    assert.doesNotMatch(src, /\.(insert|update|delete|upsert|rpc)\(/, f)
  }
  const wf = fs.readFileSync(new URL('../.github/workflows/bottleneck-watch.yml', import.meta.url), 'utf8')
  assert.match(wf, /^permissions:\n {2}contents: read/m)
  assert.match(wf, /group: bottleneck-watch/)
  assert.equal((wf.match(/- cron:/g) ?? []).length, 4)
  assert.doesNotMatch(wf, /gh variable|gh api|--admin/)
  assert.match(wf, /grep -vE '\^\(reports\/\|ops\/state\/\)'/)
})

console.log(`gauge-watch selftest: ${pass} pass · 0 fail`)
