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
//   7) 램프 배선 통합 — 실제 러너·어댑터·램프 로직, 네트워크·DB 만 가짜(단계별 타깃 수·폴백·차단 되돌리기)

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { finishRunRow } from '../lib/review/run-log.ts'
import { RAMP_FREEZE_DAYS, RAMP_STEPS, collectWithRamp, loadSourceRamp, resolveTargetLimit, rollbackOnBlock } from '../lib/review/ramp.ts'

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
t('level 0 = 폴백 기본 타깃 수 10', RAMP_STEPS[0], 10)
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

// 7) 통합 경계 — 실제 러너(runCollection) + 실제 어댑터(fmkorea) + 실제 램프 로직(collectWithRamp).
//    가짜는 네트워크(fetchText)와 DB(sb·store)뿐이다. review-collect.mjs 가 부르는 바로 그 함수다.
{
  const { fmkoreaAdapter } = await import('../lib/review/adapters/fmkorea.ts')
  const html = fs.readFileSync(path.join(root, 'fixtures', 'review', 'fmkorea', 'post-with-comments.html'), 'utf8')
  const robots = 'User-agent: *\nDisallow: /\nAllow: /$\nAllow: /best\n'

  // DB 가짜: review_source_ramp 읽기/갱신, review_source_ramp_log 쓰기를 기록한다.
  const fakeSb = ({ rampRow = null, rampError = null, logError = null, throws = false } = {}) => {
    const w = { logs: [], updates: [] }
    return {
      w,
      from(table) {
        if (throws) throw new Error('fetch failed')
        if (table === 'review_source_ramp_log') return { insert: (r) => { w.logs.push(r); return Promise.resolve({ error: logError }) } }
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: rampRow, error: rampError }) }) }),
          update: (p) => ({ eq: () => { w.updates.push(p); return Promise.resolve({ error: null }) } }),
        }
      },
    }
  }
  const harness = (postStatus = 200) => {
    const asked = []
    let clock = 9_000_000
    const ports = {
      now: () => new Date(clock),
      async sleep(ms) { clock += ms },
      async fetchText(url) {
        clock += 10
        if (url.endsWith('/robots.txt')) return { status: 200, body: robots }
        return postStatus === 200 ? { status: 200, body: html } : { status: postStatus, body: 'Forbidden' }
      },
      store: {
        async loadSource() { return { key: 'fmkorea', enabled: true, minIntervalMs: 3000, dailyRequestCap: 1000, requestsToday: 0 } },
        async listDueTargets(_k, limit) {
          asked.push(limit)
          return Array.from({ length: limit }, (_, i) => ({
            id: `t${i}`, projectId: 'p', sourceKey: 'fmkorea', productRef: `url:/best/${10342734564 + i}`, cursor: null, lastReviewAt: null, consecutiveEmpty: 0,
          }))
        },
        async saveTargetProgress() {},
        async recordFingerprint() { return 'new' },
        async appendInput() { return 'in' },
        async linkFingerprint() {},
      },
    }
    return { ports, asked }
  }
  const row = (level, targets) => ({ source_key: 'fmkorea', level, targets_per_run: targets, frozen_until: null, changed_at: 't', reason: 'r' })
  const go = (sb, h, o = {}) => collectWithRamp({ sb, adapter: fmkoreaAdapter, dryRun: false, explicitTargets: null, ports: h.ports, ...o })

  // 램프 level 2 → 러너가 22개를 요청하고 실제로 22개를 돈다
  {
    const h = harness(); const sb = fakeSb({ rampRow: row(2, 22) })
    const r = await go(sb, h)
    t('통합: level 2 → listDueTargets(22)', h.asked, [22])
    t('통합: level 2 → 실제 방문 22', r.result.targetsVisited, 22)
    t('통합: 차단 없으면 램프 쓰기 0', [sb.w.logs.length, sb.w.updates.length], [0, 0])
  }
  // 행 없음 / 테이블 없음 / 조회 실패 / 조회 예외 → 10 으로 폴백, 확인 불가는 ⚠️ 로 드러난다
  for (const [name, sb, warn] of [
    ['행 없음', fakeSb(), false],
    ['테이블 없음', fakeSb({ rampError: { code: 'PGRST205', message: 'x' } }), true],
    ['조회 실패', fakeSb({ rampError: { code: '08006', message: 'conn' } }), true],
  ]) {
    const h = harness(); const r = await go(sb, h)
    t(`통합: ${name} → 10`, h.asked, [10])
    t(`통합: ${name} → ⚠️ 표시 ${warn}`, r.notes[0].startsWith('⚠️'), warn)
  }
  {
    // from() 자체가 던져도 수집은 기본값으로 돈다. 단 되돌리기 쓰기도 같은 sb 라 throw — 차단 없을 땐 안 부른다.
    const h = harness(); const r = await go(fakeSb({ throws: true }), h)
    t('통합: 조회 예외 → 10 + ⚠️', [h.asked, r.notes[0].startsWith('⚠️')], [[10], true])
  }
  // 수동 --targets 는 램프를 무시한다
  {
    const h = harness(); await go(fakeSb({ rampRow: row(3, 30) }), h, { explicitTargets: 4 })
    t('통합: --targets=4 → 4', h.asked, [4])
  }
  // 제외 소스(danawa)는 행이 있어도 10, 되돌리기도 안 한다
  {
    const r = resolveTargetLimit('danawa', { state: 'ramp', ramp: { sourceKey: 'danawa', level: 3, targetsPerRun: 30, frozenUntil: null, changedAt: 't', reason: 'r' } }, null)
    t('제외 소스 → 10', r.limit, 10)
    const sb = fakeSb()
    t('제외 소스 → 되돌리기 null', await rollbackOnBlock(sb, 'danawa', { state: 'ramp', ramp: { level: 2 } }, 3, new Date(0), false), null)
  }
  // 차단(403) → 러너가 즉시 중단 + 직전 단계로 되돌리고 3일 동결(2026-10-05 남헌 v22, 이전 14일), 로그 먼저
  {
    const h = harness(403); const sb = fakeSb({ rampRow: row(2, 22) })
    const r = await go(sb, h)
    t('통합: 403 → 첫 타깃에서 중단', [r.result.stats.blockedResponses, r.result.targetsVisited], [1, 1])
    t('통합: 403 → 로그 1행 level 2→1', sb.w.logs.map((l) => [l.prev_level, l.new_level, l.applied_by]), [[2, 1, 'review-collect']])
    const u = sb.w.updates[0]
    t('통합: 403 → ramp level 1·타깃 15', [u?.level, u?.targets_per_run], [1, RAMP_STEPS[1]])
    t('통합: 403 → 동결 3일', Date.parse(u.frozen_until) - Date.parse(u.changed_at), RAMP_FREEZE_DAYS * 86_400_000)
    // 상수를 상수로만 대조하면 값이 바뀌어도 통과한다 — 리터럴로 고정(v22: 3일)
    t('동결 기간 = 3일(v22)', RAMP_FREEZE_DAYS, 3)
    t('되돌리기 사유에 3일 동결', sb.w.logs[0]?.reason?.includes('3일 동결'), true)
  }
  // 로그 실패 → 단계를 바꾸지 않는다
  {
    const h = harness(403); const sb = fakeSb({ rampRow: row(2, 22), logError: { message: 'down' } })
    const r = await go(sb, h)
    t('통합: 로그 실패 → update 0 + ❌ 표시', [sb.w.updates.length, r.notes.some((n) => n.startsWith('❌'))], [0, true])
  }
  // level 0 차단 / dry-run 차단 → 쓰기 0
  {
    const sb0 = fakeSb({ rampRow: row(0, 10) }); await go(sb0, harness(403))
    t('통합: level 0 차단 → 쓰기 0', [sb0.w.logs.length, sb0.w.updates.length], [0, 0])
    const sbd = fakeSb({ rampRow: row(2, 22) }); const rd = await go(sbd, harness(403), { dryRun: true })
    t('통합: dry-run 차단 → 쓰기 0 + 안내', [sbd.w.logs.length, sbd.w.updates.length, /dry-run/.test(rd.notes[1])], [0, 0, true])
  }
  // 스크립트 배선 — review-collect.mjs 가 이 경계를 실제로 탄다
  t('review-collect.mjs 가 collectWithRamp 로 실행', /await collectWithRamp\(/.test(collect), true)
  t('review-collect.mjs 가 runCollection 을 직접 부르지 않는다', /runCollection\(/.test(collect), false)
  t('review-collect.mjs 가 램프 줄을 요약에 찍는다', /for \(const n of rampNotes\) say/.test(collect), true)
  const wf = fs.readFileSync(path.join(root, '.github', 'workflows', 'nightly-review-collect.yml'), 'utf8')
  t('워크플로가 스케줄에 --targets 를 고정하지 않는다', /--targets=\$\{\{ inputs\.targets \|\| '10' \}\}/.test(wf), false)
}

console.log(`review-ramp-selftest: ${pass} pass, ${fail} fail`)
if (fail > 0) process.exit(1)
