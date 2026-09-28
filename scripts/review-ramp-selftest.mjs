#!/usr/bin/env node
// 수집 램프 전제 셀프테스트 — lib/review/run-log.ts · lib/review/ramp.ts. 네트워크·DB·env 없음.
//
// 고정하는 것:
//   1) 실행 행 마감이 차단·쿼터 건수를 함께 쓴다
//   2) 컬럼 없음(42703/PGRST204)이면 두 필드만 빼고 재시도 + 경고 — 행 자체는 남는다
//   3) 그 밖의 오류·재시도 실패는 failed — 저장된 척하지 않는다(§7.1)
//   4) 계단 10/15/22/30, level 0 = review-collect.mjs 기본 타깃 수, 단계 수 = 마이그 CHECK 범위
//   5) 램프 읽기 3상태 — 행 없음(none)과 못 읽음(unavailable)을 가른다
//   6) review-collect.mjs 가 실제로 finishRunRow 를 탄다(경계면 — 부품만 통과하는 것 방지)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { finishRunRow } from '../lib/review/run-log.ts'
import { RAMP_STEPS, loadSourceRamp } from '../lib/review/ramp.ts'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
let pass = 0
let fail = 0
const t = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want)
  if (g === w) pass++
  else { fail++; console.log(`❌ ${name}\n   기대 ${w}\n   실제 ${g}`) }
}

// update().eq() 목 — 호출마다 payload 를 기록하고 응답을 순서대로 돌려준다.
const updMock = (responses) => {
  const calls = []
  return {
    calls,
    from: () => ({ update: (payload) => ({ eq: () => { calls.push(payload); return Promise.resolve(responses[calls.length - 1]) } }) }),
  }
}
const row = { status: 'ok', requests: 3 }
const counts = { blockedResponses: 2, quotaExhaustedResponses: 1 }

// 1) 정상
{
  const m = updMock([{ error: null }])
  t('정상 → saved', await finishRunRow(m, 'r1', row, counts), { state: 'saved' })
  t('정상 → 카운트 함께 씀', m.calls[0], { status: 'ok', requests: 3, blocked_responses: 2, quota_responses: 1 })
}
// 2) 컬럼 없음 → 두 필드만 빼고 재시도
for (const code of ['42703', 'PGRST204']) {
  const m = updMock([{ error: { code, message: 'x' } }, { error: null }])
  const r = await finishRunRow(m, 'r1', row, counts)
  t(`${code} → saved_without_counts`, r.state, 'saved_without_counts')
  t(`${code} → 경고에 마이그 이름`, /20260930000033/.test(r.warning), true)
  t(`${code} → 재시도 payload 는 원래 행 그대로`, m.calls[1], row)
}
// 3) 실패
{
  const m = updMock([{ error: { code: '08006', message: 'conn' } }])
  t('그 밖의 오류 → failed, 재시도 안 함', [await finishRunRow(m, 'r1', row, counts), m.calls.length], [{ state: 'failed', error: 'conn' }, 1])
  const m2 = updMock([{ error: { code: '42703', message: 'x' } }, { error: { code: '500', message: 'down' } }])
  t('재시도도 실패 → failed', await finishRunRow(m2, 'r1', row, counts), { state: 'failed', error: 'down' })
}

// 4) 계단
t('계단', [...RAMP_STEPS], [10, 15, 22, 30])
t('계단 오름차순', RAMP_STEPS.every((v, i) => i === 0 || v > RAMP_STEPS[i - 1]), true)
const collect = fs.readFileSync(path.join(root, 'scripts', 'review-collect.mjs'), 'utf8')
t('level 0 = review-collect 기본 --targets', collect.match(/arg\('targets', '(\d+)'\)/)?.[1], String(RAMP_STEPS[0]))
const mig = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260930000034_review_source_ramp.sql'), 'utf8')
t('단계 수 = 마이그 CHECK(level BETWEEN 0 AND n)', mig.match(/CHECK \(level BETWEEN 0 AND (\d+)\)/)?.[1], String(RAMP_STEPS.length - 1))

// 5) 램프 읽기 3상태
const selMock = (r) => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve(r) }) }) }) })
t('행 없음 → none', await loadSourceRamp(selMock({ data: null, error: null }), 'clien'), { state: 'none' })
t('행 있음 → ramp', await loadSourceRamp(selMock({ data: { source_key: 'clien', level: 1, targets_per_run: 15, frozen_until: null, changed_at: 't', reason: 'r' }, error: null }), 'clien'),
  { state: 'ramp', ramp: { sourceKey: 'clien', level: 1, targetsPerRun: 15, frozenUntil: null, changedAt: 't', reason: 'r' } })
const missing = await loadSourceRamp(selMock({ data: null, error: { code: 'PGRST205', message: 'x' } }), 'clien')
t('테이블 없음 → unavailable(none 아님)', [missing.state, /20260930000034/.test(missing.reason)], ['unavailable', true])
t('조회 실패 → unavailable', (await loadSourceRamp(selMock({ data: null, error: { code: '08006', message: 'conn' } }), 'clien')).state, 'unavailable')

// 6) 경계면 — 스크립트가 옛 직접 update 로 돌아가면 카운트가 조용히 빠진다
t('review-collect.mjs 가 finishRunRow 로 마감', /await finishRunRow\(/.test(collect), true)
t('review-collect.mjs 에 직접 .update({ finished_at 마감이 없다', /\.update\(\{\s*finished_at/.test(collect), false)

console.log(`review-ramp-selftest: ${pass} pass, ${fail} fail`)
if (fail > 0) process.exit(1)
