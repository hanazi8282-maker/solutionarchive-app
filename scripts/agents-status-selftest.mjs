#!/usr/bin/env node
// lib/agents/status.ts 셀프테스트. 네트워크·DB 없음.
//
// 고정하는 것:
//   1) §7.1 3상태 — OK / EMPTY / UNAVAILABLE 을 섞지 않는가.
//      특히 "에러 없이 count=null"(없는 테이블에 head:true 를 쳤을 때 PostgREST 가
//      실제로 주는 응답. 2026-09-11 qmgrfqjfxqhxuufrnkwf 에서 실측)을 0건으로
//      접지 않는가.
//   2) stale 판정이 5분 경계에서 맞는가 · running 이 아닌 것을 stale 로 찍지 않는가.
//   3) 스텝바 기호가 scripts/status-render.mjs 어휘와 같은가.
//   4) 레지스트리의 cron 4개가 .github/workflows/*.yml 과 일치하는가 (drift 감지).
//      워크플로에서 시각을 바꾸면 이 테스트가 실패해야 대시보드가 거짓말을 안 한다.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  LOOPS, STALE_MS, MARKS, classify, renderStepBar, isStale, truncate, cronToLabel,
  isMissingTableError, UNAVAILABLE_TEXT, EMPTY_TEXT,
} from '../lib/agents/status.ts'

let pass = 0
let fail = 0
const t = (name, got, want) => {
  if (Object.is(got, want)) pass++
  else { fail++; console.log(`❌ ${name}\n   기대 ${JSON.stringify(want)}\n   실제 ${JSON.stringify(got)}`) }
}
const ok = (name, cond) => t(name, Boolean(cond), true)

// ── classify: 3상태 ──────────────────────────────────────────────
t('행 있음 → OK', classify({ rows: [{ id: 1 }] }).state, 'OK')
t('행 0개 → EMPTY', classify({ rows: [] }).state, 'EMPTY')
t('count 0 → EMPTY', classify({ count: 0 }).state, 'EMPTY')
t('count 3 → OK', classify({ count: 3 }).state, 'OK')
t('env 없음 → UNAVAILABLE', classify({ envMissing: true }).state, 'UNAVAILABLE')
t('env 없음 사유', classify({ envMissing: true }).reason, 'env_missing')
{
  const r = classify({ error: { code: 'PGRST205', message: "Could not find the table 'public.x' in the schema cache" } })
  t('PGRST205 → UNAVAILABLE', r.state, 'UNAVAILABLE')
  t('PGRST205 사유 table_missing', r.reason, 'table_missing')
}
t('42P01 도 table_missing', classify({ error: { code: '42P01', message: 'relation "x" does not exist' } }).reason, 'table_missing')
t('그 외 에러 → query_failed', classify({ error: { code: '42501', message: 'permission denied' } }).reason, 'query_failed')
// ⚠️ 이 한 줄이 이 파일의 존재 이유다. 에러가 없다고 0건으로 접으면 안 된다.
t('에러 없이 count=null → UNAVAILABLE', classify({ error: null, count: null }).state, 'UNAVAILABLE')
t('에러 없이 count=null 사유', classify({ error: null, count: null }).reason, 'table_missing')
t('rows=null 도 UNAVAILABLE', classify({ rows: null }).state, 'UNAVAILABLE')
// 0건 문구와 확인불가 문구가 같은 문자열이면 화면에서 두 사건이 구분되지 않는다.
ok('확인불가 문구 ≠ 0건 문구', UNAVAILABLE_TEXT.table_missing !== EMPTY_TEXT && !EMPTY_TEXT.startsWith('확인 불가'))
ok('0건 문구는 조회 정상임을 밝힌다', EMPTY_TEXT.includes('0건') && EMPTY_TEXT.includes('정상'))
ok('table_missing 문구에 마이그레이션 언급', UNAVAILABLE_TEXT.table_missing.includes('마이그레이션'))
ok('isMissingTableError: 메시지만으로도', isMissingTableError(null, 'Could not find the table in the schema cache'))
ok('isMissingTableError: 무관 에러 false', !isMissingTableError('42501', 'permission denied'))

// ── stale ────────────────────────────────────────────────────────
const NOW = Date.parse('2026-09-11T00:00:00Z')
t('STALE_MS = 5분', STALE_MS, 5 * 60 * 1000)
t('running + 6분 미갱신 → stale', isStale('running', NOW - 6 * 60_000, NOW), true)
t('running + 정확히 5분 → 아직 아님', isStale('running', NOW - STALE_MS, NOW), false)
t('running + 4분 → 아님', isStale('running', NOW - 4 * 60_000, NOW), false)
t('ok 상태는 오래돼도 stale 아님', isStale('ok', NOW - 999 * 60_000, NOW), false)
t('lastTouch 모름(0) → 판정 안 함', isStale('running', 0, NOW), false)

// ── 스텝바 ───────────────────────────────────────────────────────
t('기호 어휘 = status-render.mjs', Object.entries(MARKS).map(([k, v]) => k + v).join(','),
  'ok●,running◐,pending○,skipped○,failed✕,blocked▲')
t('스텝바 렌더', renderStepBar([
  { seq: 1, status: 'ok' }, { seq: 2, status: 'ok' }, { seq: 3, status: 'running' },
  { seq: 4, status: 'pending' }, { seq: 5, status: 'failed' }, { seq: 6, status: 'blocked' },
]), '●●◐○✕▲')
t('스텝바: seq 순으로 정렬', renderStepBar([{ seq: 2, status: 'failed' }, { seq: 1, status: 'ok' }]), '●✕')
t('스텝바: 모르는 상태 → ?', renderStepBar([{ seq: 1, status: 'weird' }]), '?')
t('스텝바: 스텝 없음 → 빈 문자열(가짜 기호 금지)', renderStepBar([]), '')
t('스텝바: null → 빈 문자열', renderStepBar(null), '')

// ── truncate (원문 노출 방지) ────────────────────────────────────
{
  const long = 'x'.repeat(500)
  const cut = truncate(long)
  ok('200자 초과분은 잘린다', !cut.includes(long) && cut.startsWith('x'.repeat(200)))
  ok('잘렸다는 사실을 표시한다', cut.includes('500자 중 200자'))
  t('짧은 문자열은 그대로', truncate('짧다'), '짧다')
  ok('객체도 문자열로 잘린다', truncate({ error: 'y'.repeat(400) }).length <= 220)
}

// ── cron 라벨 ────────────────────────────────────────────────────
t('cron → UTC/KST 라벨', cronToLabel('17 20 * * *'), 'UTC 20:17 · KST 05:17')
t('cron 자정 넘김', cronToLabel('41 18 * * *'), 'UTC 18:41 · KST 03:41')
t('cron 형식 아니면 원문', cronToLabel('@daily'), '@daily')

// ── 레지스트리 ↔ 워크플로 대조 (drift 감지) ──────────────────────
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
t('루프 4개', LOOPS.length, 4)

for (const loop of LOOPS) {
  const file = path.join(ROOT, '.github', 'workflows', loop.workflow)
  if (!fs.existsSync(file)) { fail++; console.log(`❌ 워크플로 파일 없음: ${loop.workflow}`); continue }
  const yml = fs.readFileSync(file, 'utf-8')

  // 주석 처리된 cron 도 잡는다 — 노션 루프가 그 상태다. 활성/비활성은 따로 본다.
  const lines = yml.split('\n').filter((l) => /-\s*cron:/.test(l))
  const crons = lines.map((l) => (l.match(/cron:\s*'([^']+)'/) ?? [])[1]).filter(Boolean)
  ok(`${loop.key}: 워크플로에 cron 1개`, crons.length === 1)
  t(`${loop.key}: cron 일치`, crons[0], loop.cronExpr)

  const active = lines.some((l) => !/^\s*#/.test(l))
  t(`${loop.key}: scheduleActive 일치`, active, loop.scheduleActive)
}
ok('노션 루프는 비활성으로 등록', LOOPS.find((l) => l.key === 'notion').scheduleActive === false)

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) { console.log('에이전트 상태 로직 또는 워크플로 cron 이 어긋났다.'); process.exitCode = 1 }
else console.log('정상 — 3상태 분류 · stale 5분 · 스텝바 기호 · 원문 절단 · cron drift 없음.')
