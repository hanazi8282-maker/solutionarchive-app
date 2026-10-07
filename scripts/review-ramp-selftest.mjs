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
//   8) robots 예외 기록(마이그 20261006000001) — 실제 러너 소유자 예외 경로 → finishRunRow → 가짜 DB, 컬럼 있음·없음 각각
//   9) 퍼센트 램프(남헌 v24·v25, 마이그 20261006000002) — 순수 전이 + 실제 러너 예산 + 하루 판정(상태 가진 가짜 DB)
//      2일 연속 상승 · 하루 정상은 상승 안 함 · 차단 즉시 하강·리셋 · 2회째 차단 14일 · 90% 유지 · 공급 부족 보류 ·
//      행 없음/칸 없음 폴백(예산 = 지금과 같음) · 제외 소스 쓰기 0 · 로그 먼저

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { finishRunRow } from '../lib/review/run-log.ts'
import {
  PCT_ESCALATED_FREEZE_DAYS, PCT_STEPS, RAMP_FREEZE_DAYS, RAMP_STEPS, allocateShares, collectWithRamp, judgePctDay, loadSourceRamp,
  nextPctState, pctOnBlock, pctTarget, resolveTargetLimit, rollbackOnBlock, stepPctRamps,
} from '../lib/review/ramp.ts'

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

const ov = { robotsOwnerOverride: 4, robotsBypassed: 1, overrideValue: 'owner_2026-10-05' }
const ovCols = { robots_owner_override: 4, robots_bypassed: 1, override_value: 'owner_2026-10-05' }
// 1) 정상
{
  const m = updMock([{ error: null }])
  t('정상 → saved', await finishRunRow(m, 'r1', row, counts, ov), { state: 'saved' })
  t('정상 → 카운트·override 함께 씀', m.calls[0], { status: 'ok', requests: 3, blocked_responses: 2, quota_responses: 1, ...ovCols })
  const m0 = updMock([{ error: null }])
  await finishRunRow(m0, 'r1', row, counts)
  t('override 인자 생략 → 0·0·NULL', [m0.calls[0].robots_owner_override, m0.calls[0].robots_bypassed, m0.calls[0].override_value], [0, 0, null])
}
// 2) 컬럼 없음, 메시지에 override 컬럼 이름 없음 → 000033 동작 그대로: 차단·쿼터 두 필드만 뺀다
for (const code of ['42703', 'PGRST204']) {
  const m = updMock([{ error: { code, message: 'x' } }, { error: null }])
  const r = await finishRunRow(m, 'r1', row, counts, ov)
  t(`${code} → saved_without_counts`, r.state, 'saved_without_counts')
  t(`${code} → 경고에 마이그 이름`, /20260930000033/.test(r.warning), true)
  t(`${code} → 재시도 payload 는 카운트만 빠짐`, m.calls[1], { ...row, ...ovCols })
}
// 2b) 메시지에 override 컬럼 이름 → override 3필드만 빼고 재시도, memo 에 기억
for (const [code, message] of [
  ['PGRST204', "Could not find the 'robots_bypassed' column of 'review_collection_runs' in the schema cache"],
  ['42703', 'column "override_value" of relation "review_collection_runs" does not exist'],
]) {
  const memo = {}
  const m = updMock([{ error: { code, message } }, { error: null }])
  const r = await finishRunRow(m, 'r1', row, counts, ov, memo)
  t(`${code} override 없음 → missing=[override]`, [r.state, r.missing], ['saved_without_counts', ['override']])
  t(`${code} override 없음 → 경고에 000001 마이그·값`, /20261006000001/.test(r.warning) && r.warning.includes('owner_2026-10-05'), true)
  t(`${code} override 없음 → 재시도는 카운트 유지`, m.calls[1], { ...row, blocked_responses: 2, quota_responses: 1 })
  t(`${code} → memo 기억`, memo, { overrideMissing: true })
  // 같은 실행의 다음 소스: 처음부터 빼고 1번만 보낸다(경고는 계속 — 그 행도 못 남겼으니)
  const m2 = updMock([{ error: null }])
  const r2 = await finishRunRow(m2, 'r2', row, counts, ov, memo)
  t(`${code} 다음 소스 → 1회 호출·override 없는 payload`, [m2.calls.length, m2.calls[0]], [1, { ...row, blocked_responses: 2, quota_responses: 1 }])
  t(`${code} 다음 소스 → 경고 유지`, r2.missing, ['override'])
}
// 2c) 두 마이그 다 미적용 → override 먼저(이름 있음), 그다음 카운트 → 원래 행만
{
  const memo = {}
  const m = updMock([
    { error: { code: 'PGRST204', message: "Could not find the 'override_value' column" } },
    { error: { code: 'PGRST204', message: "Could not find the 'blocked_responses' column" } },
    { error: null },
  ])
  const r = await finishRunRow(m, 'r1', row, counts, ov, memo)
  t('둘 다 없음 → 3회·마지막은 원래 행', [m.calls.length, m.calls[2]], [3, row])
  t('둘 다 없음 → missing 2개·경고에 마이그 둘', [r.missing, /20260930000033/.test(r.warning) && /20261006000001/.test(r.warning)], [['counts', 'override'], true])
  const m3 = updMock([{ error: { code: '42703', message: 'x' } }, { error: { code: '42703', message: 'y' } }])
  t('더 뺄 게 없는데도 컬럼 없음 → failed', (await finishRunRow(m3, 'r1', row, counts, ov, { overrideMissing: true })).state, 'failed')
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
  { state: 'ramp', ramp: { sourceKey: 'clien', level: 1, targetsPerRun: 15, frozenUntil: null, changedAt: 't', reason: 'r', pctReady: true, pct: null } })
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

  // 8) override 기록 통합 경계 — 실제 러너(소유자 예외 경로) → RunResult → finishRunRow → 가짜 DB(컬럼 스키마 흉내).
  //    review-collect.mjs 와 같은 인자 매핑으로 부른다(아래 배선 검사가 스크립트 쪽 매핑을 고정한다).
  {
    const baseCols = ['finished_at', 'status', 'requests', 'blocked_responses', 'quota_responses']
    // PostgREST 처럼: 모르는 컬럼이 하나라도 있으면 그 이름을 담아 PGRST204, 아니면 저장.
    const schemaDb = (cols) => {
      const saved = []
      let calls = 0
      return {
        saved, get calls() { return calls },
        from: () => ({ update: (p) => ({ eq: () => {
          calls++
          const bad = Object.keys(p).find((k) => !cols.includes(k))
          if (bad) return Promise.resolve({ error: { code: 'PGRST204', message: `Could not find the '${bad}' column of 'review_collection_runs' in the schema cache` } })
          saved.push(p); return Promise.resolve({ error: null })
        } }) }),
      }
    }
    const ownerHarness = () => {
      const h = harness()
      const fetch0 = h.ports.fetchText
      h.ports.fetchText = async (url) => (url.endsWith('/robots.txt') ? { status: 200, body: 'User-agent: *\nDisallow: /\n' } : fetch0(url))
      h.ports.store.loadSource = async () => ({
        key: 'fmkorea', enabled: true, minIntervalMs: 3000, dailyRequestCap: 1000, requestsToday: 0,
        robotsOwnerOverride: true, overrideValue: 'owner_2026-10-05',
      })
      return h
    }
    const finish = (db, result, memo) => finishRunRow(db, 'run1',
      { finished_at: 'x', status: 'ok', requests: result.requests },
      { blockedResponses: result.stats.blockedResponses, quotaExhaustedResponses: result.stats.quotaExhaustedResponses },
      { robotsOwnerOverride: result.robotsOwnerOverride ?? 0, robotsBypassed: result.robotsBypassed ?? 0, overrideValue: result.overrideValue ?? null },
      memo)

    const { result } = await go(fakeSb({ rampRow: row(0, 10) }), ownerHarness(), { explicitTargets: 2 })
    t('통합 override: 러너가 금지 robots 를 예외로 통과(사용 = 요청 수 > 0)', [result.robotsOwnerOverride > 0, result.robotsOwnerOverride === result.requests], [true, true])
    t('통합 override: RunResult 에 스냅샷 값', result.overrideValue, 'owner_2026-10-05')

    // 컬럼 있음 → 한 번에 저장, 세 값이 그대로
    const withCols = schemaDb([...baseCols, 'robots_owner_override', 'robots_bypassed', 'override_value'])
    const r1 = await finish(withCols, result, {})
    t('통합 override 컬럼 있음 → saved·1회', [r1.state, withCols.calls], ['saved', 1])
    t('통합 override 컬럼 있음 → 저장값', [withCols.saved[0].robots_owner_override, withCols.saved[0].robots_bypassed, withCols.saved[0].override_value],
      [result.robotsOwnerOverride, 0, 'owner_2026-10-05'])

    // 컬럼 없음 → override 만 빼고 저장(카운트·실행 행은 남는다), 다음 소스는 1회로
    const noCols = schemaDb(baseCols)
    const memo = {}
    const r2 = await finish(noCols, result, memo)
    t('통합 override 컬럼 없음 → 행 저장·경고', [r2.state, r2.missing, noCols.saved.length], ['saved_without_counts', ['override'], 1])
    t('통합 override 컬럼 없음 → 카운트는 저장', [noCols.saved[0].blocked_responses, 'override_value' in noCols.saved[0]], [0, false])
    await finish(noCols, result, memo)
    t('통합 override 컬럼 없음 → 다음 소스는 재시도 없이 1회(총 3회)', noCols.calls, 3)

    // 예외 없는 소스 → override_value NULL·사용 0
    const { result: plain } = await go(fakeSb({ rampRow: row(0, 10) }), harness(), { explicitTargets: 1 })
    const plainDb = schemaDb([...baseCols, 'robots_owner_override', 'robots_bypassed', 'override_value'])
    await finish(plainDb, plain, {})
    t('통합 override: 예외 없는 소스 → 0·NULL', [plainDb.saved[0].robots_owner_override, plainDb.saved[0].override_value], [0, null])

    // 스크립트 배선 — review-collect.mjs 가 같은 세 값과 memo 를 넘긴다
    t('review-collect.mjs 가 robotsOwnerOverride 를 finishRunRow 에 넘긴다', /robotsOwnerOverride: result\?\.robotsOwnerOverride \?\? 0,\s*robotsBypassed: result\?\.robotsBypassed \?\? 0,\s*overrideValue: result\?\.overrideValue \?\? null,\s*\},\s*runLogMemo,/.test(collect), true)
    t('review-collect.mjs 가 실행당 memo 하나', /const runLogMemo = \{\}/.test(collect), true)
    const store = fs.readFileSync(path.join(root, 'lib', 'review', 'store.ts'), 'utf8')
    t('store.loadSource 가 override 원값을 넘긴다', /overrideValue: data\.override \?\? null/.test(store), true)
  }

  // 9) 퍼센트 램프 ─────────────────────────────────────────────────
  // 9-1) 순수 전이
  t('퍼센트 단계 50~90', [...PCT_STEPS], [50, 60, 70, 80, 90])
  const pmig = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20261006000002_review_source_ramp_pct.sql'), 'utf8')
  t('단계 = 마이그 CHECK(pct_step IN ...)', pmig.match(/CHECK \(pct_step IN \(([\d, ]+)\)\)/)?.[1], PCT_STEPS.join(', '))
  t('마이그는 ADD COLUMN 만(DROP·UPDATE·INSERT·DELETE 없음)', /\b(DROP|UPDATE|INSERT INTO|DELETE)\b/.test(pmig.replace(/^--.*$/gm, '')), false)
  t('목표 = floor(상한 × pct)', [pctTarget(462, 50), pctTarget(369, 60), pctTarget(600, 90, 397)], [231, 221, 357])
  t('하루 정상 → 1일차, 상승 없음', nextPctState({ pctStep: 50, consecutiveOkDays: 0 }, 'ok'), { pctStep: 50, consecutiveOkDays: 1, rose: false })
  t('정상 2일 연속 → 한 단계 + 0', nextPctState({ pctStep: 50, consecutiveOkDays: 1 }, 'ok'), { pctStep: 60, consecutiveOkDays: 0, rose: true })
  t('90% 정상 → 유지(초과 금지)', nextPctState({ pctStep: 90, consecutiveOkDays: 1 }, 'ok'), { pctStep: 90, consecutiveOkDays: 2, rose: false })
  t('차단일 → 연속 0', nextPctState({ pctStep: 70, consecutiveOkDays: 1 }, 'blocked'), { pctStep: 70, consecutiveOkDays: 0, rose: false })
  for (const v of ['none', 'quota', 'error', 'frozen', 'alloc', 'short']) {
    t(`${v} → 보류(넣지도 리셋하지도 않음)`, nextPctState({ pctStep: 60, consecutiveOkDays: 1 }, v), { pctStep: 60, consecutiveOkDays: 1, rose: false })
  }
  const okRow = { status: 'ok', requests: 100, blocked_responses: 0, quota_responses: 0, health_after: 'ok' }
  const jd = (rows, o = {}) => judgePctDay({ rows, dayTarget: 100, pct: 50, frozen: false, allocLimited: false, ...o }).verdict
  t('판정: 정상', jd([okRow]), 'ok')
  t('판정: 행 없음 → none', jd([]), 'none')
  t('판정: 차단이 다른 무엇보다 먼저', jd([{ ...okRow, blocked_responses: 1, status: 'failed' }], { frozen: true }), 'blocked')
  t('판정: 쿼터 → quota', jd([{ ...okRow, quota_responses: 2 }]), 'quota')
  t('판정: failed/interrupted/broken → error', [jd([{ ...okRow, status: 'failed' }]), jd([okRow, { ...okRow, status: 'interrupted' }]), jd([{ ...okRow, health_after: 'broken' }])], ['error', 'error', 'error'])
  t('판정: 동결 중 → frozen', jd([okRow], { frozen: true }), 'frozen')
  t('판정: 배분으로 목표 깎임 → alloc', jd([okRow], { allocLimited: true }), 'alloc')
  // 50% 목표 100 → 직전 단계(40%) 목표 80. 79 는 부족, 80 은 충족.
  t('판정: 공급 부족 문턱 = 직전 단계 목표', [jd([{ ...okRow, requests: 79 }]), jd([{ ...okRow, requests: 80 }])], ['short', 'ok'])
  t('판정: 두 슬롯 요청 합으로 본다', jd([{ ...okRow, requests: 40 }, { ...okRow, requests: 40 }]), 'ok')
  {
    const b1 = pctOnBlock({ pctStep: 70, capBase: 600 }, 0, 120)
    t('차단 1회째 → 한 단계 하강·3일·연속 0', [b1.pctStep, b1.freezeDays, b1.consecutiveOkDays, b1.blocksAtStep], [60, RAMP_FREEZE_DAYS, 0, 1])
    t('차단선 120 → 상한 600→108(×0.9, 내리기만)', [b1.blockLine, b1.capBase], [120, 108])
    const b2 = pctOnBlock({ pctStep: 70, capBase: 600 }, 1, 900)
    t('같은 단계 2회째 → 14일', [b2.freezeDays, b2.escalated, PCT_ESCALATED_FREEZE_DAYS], [14, true, 14])
    t('차단선이 상한보다 높으면 상한 그대로', b2.capBase, 600)
    t('이전 차단 수 확인 불가 → 2회째로(긴 동결)', pctOnBlock({ pctStep: 60, capBase: 100 }, null, 10).freezeDays, 14)
    t('50% 차단 → 50 바닥', pctOnBlock({ pctStep: 50, capBase: 100 }, 0, 10).pctStep, 50)
    t('차단선 1 → 0.9 내림 0 은 못 쓴다(상한 그대로 — 사람 몫)', pctOnBlock({ pctStep: 50, capBase: 100 }, 0, 1).capBase, 100)
  }
  {
    // 보고서 §3 숫자 그대로 — 18소스(상한·간격) 합 298분 > 180분이면 water-fill: 제값 8곳, 나머지 10곳은 각 794초.
    const s18 = [['appstore', 200, 2000], ['hackernews', 600, 2000], ['damoang', 300, 3000], ['82cook', 369, 3000], ['theqoo', 300, 3000],
      ['bobaedream', 336, 3000], ['tumblbug', 100, 3000], ['brunch', 150, 5000], ['clien', 462, 5000], ['fmkorea', 300, 3000], ['okky', 300, 4000],
      ['velog', 300, 4000], ['youtube', 4320, 1000], ['disquiet', 50, 5000], ['devto', 60, 6000], ['yozm', 40, 6000], ['indiehackers', 40, 6000],
      ['googleplay', 40, 8000]].map(([key, requests, intervalMs]) => ({ key, requests, intervalMs }))
    const a = allocateShares(s18)
    t('배분 A 숫자 재현(hackernews 397·clien 158·okky 198·youtube 794)', [a.get('hackernews'), a.get('clien'), a.get('okky'), a.get('youtube'), a.size], [397, 158, 198, 794, 10])
    t('배분: 작은 소스는 안 깎인다', [a.has('appstore'), a.has('yozm')], [false, false])
    // 오늘 분모(타깃 있는 7소스) 합 123.5분 → 발동 없음
    const s7 = s18.filter((s) => ['hackernews', 'bobaedream', 'okky', 'clien', 'disquiet', 'velog', 'indiehackers'].includes(s.key))
    t('배분 B: 7소스 123.5분 → 깎는 소스 0', allocateShares(s7).size, 0)
  }

  // 9-2) 상태 가진 가짜 DB — 테이블 5개, 필터 eq/not/gte/lt, 쓰기 순서 기록. PostgREST 처럼 칸 없음 42703, 테이블 없음 PGRST205.
  const memDb = ({ ramp = [], sources = [], targets = [], runs = [], pctCols = true, rampTable = true, logError = null, countError = null } = {}) => {
    const T = { review_source_ramp: ramp, review_source_ramp_log: [], review_sources: sources, review_targets: targets, review_collection_runs: runs }
    const ops = []
    const match = (r, f) => f.every(([op, c, v]) => (op === 'eq' ? r[c] === v : op === 'not' ? r[c] != null : op === 'gte' ? r[c] >= v : r[c] < v))
    const resolve = ({ table, op, payload, opts, f, single }) => {
      ops.push([table, op])
      if (table === 'review_source_ramp' && !rampTable) return { data: null, error: { code: 'PGRST205', message: 'no table' } }
      if (table === 'review_source_ramp' && op === 'select' && !pctCols && /pct_step/.test(payload)) return { data: null, error: { code: '42703', message: 'column review_source_ramp.pct_step does not exist' } }
      if (op === 'insert') {
        if (logError) return { error: logError }
        T[table].push(payload); return { error: null }
      }
      const rows = T[table].filter((r) => match(r, f))
      if (op === 'update') { for (const r of rows) Object.assign(r, payload); return { error: null } }
      if (opts?.head) return countError ? { count: null, error: countError } : { count: rows.length, error: null }
      return { data: single ? (rows[0] ?? null) : rows.map((r) => ({ ...r })), error: null }
    }
    return {
      T, ops,
      from(table) {
        const q = (op, payload, opts) => {
          const f = []
          const run = (single) => Promise.resolve(resolve({ table, op, payload, opts, f, single }))
          const b = {
            eq: (c, v) => (f.push(['eq', c, v]), b), not: (c) => (f.push(['not', c]), b),
            gte: (c, v) => (f.push(['gte', c, v]), b), lt: (c, v) => (f.push(['lt', c, v]), b),
            maybeSingle: () => run(true), then: (res, rej) => run(false).then(res, rej),
          }
          return b
        }
        return { select: (c, o) => q('select', c, o), insert: (p) => q('insert', p), update: (p) => q('update', p) }
      },
    }
  }
  const pctRow = (o = {}) => ({
    source_key: 'fmkorea', level: 0, targets_per_run: 10, frozen_until: null, changed_at: 't', reason: 'r',
    pct_step: 50, cap_base: 200, daily_request_target: null, consecutive_ok_days: 0, last_evaluated_date: null,
    block_line: null, blocks_at_step: 0, supply_state: null, ...o,
  })
  const writes = (db) => db.ops.filter(([, op]) => op !== 'select').length

  // 9-3) 러너 예산 통합 — 실제 러너 + 실제 어댑터. 목표 5 면 요청 5 에서 멈추고 문구가 '오늘 램프 목표 도달'.
  {
    const h = harness(); const db = memDb({ ramp: [pctRow({ cap_base: 10 })] })
    const r = await go(db, h)
    t('예산: 50% × 상한 10 → 요청 5', r.result.requests, 5)
    t('예산: 목표로 멈춘 타깃은 문구가 갈린다', r.result.perTarget.filter((p) => p.outcome === '오늘 램프 목표 도달').length > 0, true)
    t('예산: 요약 줄(단계·연속정상·오늘목표·상한)', r.notes[1], '퍼센트 50% · 연속정상 0일 · 오늘목표 5 / 상한 10')
    t('예산: 차단 없으면 램프 쓰기 0', writes(db), 0)
    const h9 = harness(); const r9 = await go(memDb({ ramp: [pctRow({ cap_base: 1000, pct_step: 90, daily_request_target: 900 })] }), h9)
    t('요약 줄: 90% → 안정', r9.notes[1].endsWith('· 안정'), true)
  }
  {
    // 회귀 금지: 행 없음 · 칸 없음(마이그 미적용) · cap_base NULL · 제외 소스 → 러너 예산은 daily_request_cap 그대로(요청 수 같음)
    const base = (await go(memDb(), harness())).result.requests
    const noCols = memDb({ ramp: [pctRow({ cap_base: 10 })], pctCols: false })
    const rc = await go(noCols, harness())
    // notes 2줄 = 타깃 수 줄 + 예산 3상태 줄(v30 §2 — '퍼센트 칸 없음 → 기존 예산'). 퍼센트 요약 줄은 없다.
    t('칸 없음 → 옛 칸 재조회·예산 그대로', [rc.result.requests, rc.notes.length, /기존 예산/.test(rc.notes[1]), noCols.ops.filter(([tb, op]) => tb === 'review_source_ramp' && op === 'select').length], [base, 2, true, 2])
    t('cap_base NULL → 예산 그대로·요약 줄 없음', [(await go(memDb({ ramp: [pctRow({ cap_base: null })] }), harness())).result.requests], [base])
    t('행 없음 기준선 = 10 타깃 전부', base, 10)
    const ex = await collectWithRamp({ sb: memDb({ ramp: [pctRow({ source_key: 'danawa', cap_base: 4 })] }), adapter: { ...fmkoreaAdapter, key: 'danawa' }, dryRun: false, explicitTargets: null, ports: harness().ports })
    t('제외 소스 → 퍼센트 예산 없음', ex.result.requests, base)
  }
  // 9-4) 차단 → 즉시 하강(로그 먼저) — 실제 러너 403
  {
    const h = harness(403)
    h.ports.store.loadSource = async () => ({ key: 'fmkorea', enabled: true, minIntervalMs: 3000, dailyRequestCap: 1000, requestsToday: 199 })
    const db = memDb({ ramp: [pctRow({ pct_step: 70, cap_base: 600, level: 2, targets_per_run: 22, consecutive_ok_days: 1 })] })
    const r = await go(db, h)
    const logI = db.ops.findIndex(([tb, op]) => tb === 'review_source_ramp_log' && op === 'insert')
    const updI = db.ops.findIndex(([tb, op]) => tb === 'review_source_ramp' && op === 'update')
    t('차단: 로그가 갱신보다 먼저(#419 순서)', logI >= 0 && logI < updI, true)
    const lg = db.T.review_source_ramp_log[0]
    t('차단: 로그 1행 70→60·level 2→1·event block', [db.T.review_source_ramp_log.length, lg.prev_pct, lg.new_pct, lg.prev_level, lg.new_level, lg.event], [1, 70, 60, 2, 1, 'block'])
    const rr = db.T.review_source_ramp[0]
    t('차단: 60%·연속 0·level 1/15', [rr.pct_step, rr.consecutive_ok_days, rr.level, rr.targets_per_run], [60, 0, 1, 15])
    t('차단: 차단선 = 오늘 앞서 쓴 199 + 이번 1 = 200 → 상한 180·목표 108', [rr.block_line, rr.cap_base, rr.daily_request_target], [200, 180, 108])
    t('차단: 동결 3일', Date.parse(rr.frozen_until) - Date.parse(rr.changed_at), 3 * 86_400_000)
    t('차단: blocks_at_step 1', rr.blocks_at_step, 1)
    t('차단: 요약에 사유', r.notes.some((n) => n.includes('퍼센트 70%→60%')), true)
  }
  {
    // 같은 단계 2회째: 로그에 그 단계(prev_pct 60) 차단이 이미 1건 → 14일
    const db = memDb({ ramp: [pctRow({ pct_step: 60, cap_base: 600 })] })
    db.T.review_source_ramp_log.push({ source_key: 'fmkorea', event: 'block', prev_pct: 60 }, { source_key: 'fmkorea', event: 'block', prev_pct: 70 }, { source_key: 'clien', event: 'block', prev_pct: 60 })
    await go(db, harness(403))
    const rr = db.T.review_source_ramp[0]
    t('2회째 차단 → 14일·blocks_at_step 2', [Date.parse(rr.frozen_until) - Date.parse(rr.changed_at), rr.blocks_at_step], [14 * 86_400_000, 2])
    const dbE = memDb({ ramp: [pctRow({ pct_step: 60, cap_base: 600 })], countError: { message: 'down' } })
    const rE = await go(dbE, harness(403))
    t('이전 차단 수 조회 실패 → 14일 + 사유에 확인 불가', [Date.parse(dbE.T.review_source_ramp[0].frozen_until) - Date.parse(dbE.T.review_source_ramp[0].changed_at), rE.notes.some((n) => n.includes('확인 불가'))], [14 * 86_400_000, true])
  }
  {
    const db = memDb({ ramp: [pctRow({ pct_step: 70 })], logError: { message: 'down' } })
    const r = await go(db, harness(403))
    t('차단 로그 실패 → 갱신 0 + ❌', [db.ops.filter(([, op]) => op === 'update').length, db.T.review_source_ramp[0].pct_step, r.notes.some((n) => n.startsWith('❌'))], [0, 70, true])
    const dd = memDb({ ramp: [pctRow({ pct_step: 70 })] })
    const rd = await go(dd, harness(403), { dryRun: true })
    t('차단 dry-run → 쓰기 0 + 안내', [writes(dd), rd.notes.some((n) => n.startsWith('dry-run'))], [0, true])
    const dx = memDb({ ramp: [pctRow({ source_key: 'danawa', pct_step: 70 })] })
    await collectWithRamp({ sb: dx, adapter: { ...fmkoreaAdapter, key: 'danawa' }, dryRun: false, explicitTargets: null, ports: harness(403).ports })
    t('제외 소스 차단 → 쓰기 0', writes(dx), 0)
  }

  // 9-5) 하루 판정(stepPctRamps) — 날짜를 넘기며 같은 DB 로 돈다
  {
    const at = (iso) => new Date(iso)
    const run = (day, o = {}) => ({ source_key: 'fmkorea', dry_run: false, started_at: `${day}T05:40:00.000Z`, ...okRow, ...o })
    t('행 없음 → 출력·쓰기 0', [await stepPctRamps(memDb(), at('2026-10-07T06:00:00Z'), false), writes(memDb())], [[], 0])
    t('테이블 없음 → [] (소스별 ⚠️ 는 collectWithRamp 가 낸다)', await stepPctRamps(memDb({ rampTable: false }), at('2026-10-07T06:00:00Z'), false), [])
    const nc = memDb({ ramp: [pctRow()], pctCols: false })
    const ncNotes = await stepPctRamps(nc, at('2026-10-07T06:00:00Z'), false)
    t('칸 없음 → ⚠️ 한 줄·쓰기 0', [ncNotes.length, /^⚠️.*20261006000002/.test(ncNotes[0]), writes(nc)], [1, true, 0])

    // 상한 200, 50% → 목표 100, 공급 부족 문턱 80.
    const db = memDb({ ramp: [pctRow()], sources: [{ key: 'fmkorea', enabled: true, min_interval_ms: 3000, daily_request_cap: 400 }], targets: [{ source_key: 'fmkorea', status: 'active' }] })
    const R = () => db.T.review_source_ramp[0]
    await stepPctRamps(db, at('2026-10-05T18:00:00Z'), false)
    t('첫 판정 = 시작(시작일 오늘은 세지 않음)', [db.T.review_source_ramp_log.at(-1).event, R().last_evaluated_date, R().consecutive_ok_days, R().daily_request_target], ['start', '2026-10-05', 0, 100])
    db.T.review_collection_runs.push(run('2026-10-06'))
    await stepPctRamps(db, at('2026-10-07T06:00:00Z'), false)
    t('정상 1일 → 50% 유지·연속 1', [R().pct_step, R().consecutive_ok_days, R().supply_state], [50, 1, 'met'])
    const nLog = db.T.review_source_ramp_log.length
    await stepPctRamps(db, at('2026-10-07T18:00:00Z'), false)
    t('같은 날 둘째 슬롯 → 판정 안 함(날짜 잠금)', db.T.review_source_ramp_log.length, nLog)
    db.T.review_collection_runs.push(run('2026-10-07', { requests: 79 }))
    await stepPctRamps(db, at('2026-10-08T06:00:00Z'), false)
    t('공급 부족 → 유지·연속 1 그대로·short', [R().pct_step, R().consecutive_ok_days, R().supply_state], [50, 1, 'short'])
    db.T.review_collection_runs.push(run('2026-10-08'))
    await stepPctRamps(db, at('2026-10-09T06:00:00Z'), false)
    t('정상 2일째(보류 사이) → 60%·연속 0·목표 120', [R().pct_step, R().consecutive_ok_days, R().daily_request_target, db.T.review_source_ramp_log.at(-1).event], [60, 0, 120, 'rise'])
    db.T.review_collection_runs.push(run('2026-10-09', { requests: 120, status: 'interrupted' }))
    await stepPctRamps(db, at('2026-10-10T06:00:00Z'), false)
    t('interrupted → 보류(리셋 아님)', [R().pct_step, R().consecutive_ok_days], [60, 0])
    db.T.review_collection_runs.push(run('2026-10-10', { requests: 120 }))
    await stepPctRamps(db, at('2026-10-11T06:00:00Z'), false)
    db.T.review_collection_runs.push(run('2026-10-11', { requests: 120, blocked_responses: 1 }))
    await stepPctRamps(db, at('2026-10-12T06:00:00Z'), false)
    t('차단일 → 연속 0', [R().pct_step, R().consecutive_ok_days], [60, 0])
    await stepPctRamps(db, at('2026-10-13T06:00:00Z'), false)
    t('행 없는 날 → 측정 없음 보류', [R().consecutive_ok_days, R().supply_state], [0, 'none'])
    t('모든 판정이 로그를 먼저 남긴다(로그 수 = 판정 수)', db.T.review_source_ramp_log.length, 8)
    t('로그 event 흐름', db.T.review_source_ramp_log.map((l) => l.event), ['start', 'day', 'day', 'rise', 'day', 'day', 'day', 'day'])
  }
  {
    // 90% 유지 + 동결 중 보류 + 로그 실패 + dry-run + 제외 소스
    const day = '2026-10-06'
    const runs = [{ source_key: 'fmkorea', dry_run: false, started_at: `${day}T05:40:00.000Z`, ...okRow, requests: 180 }]
    const d90 = memDb({ ramp: [pctRow({ pct_step: 90, consecutive_ok_days: 1, last_evaluated_date: '2026-10-05', daily_request_target: 180 })], runs })
    const n90 = await stepPctRamps(d90, new Date('2026-10-07T06:00:00Z'), false)
    t('90% 정상 → 유지·안정 표시', [d90.T.review_source_ramp[0].pct_step, n90.some((n) => n.endsWith('· 안정'))], [90, true])
    const dz = memDb({ ramp: [pctRow({ consecutive_ok_days: 1, last_evaluated_date: '2026-10-05', frozen_until: '2026-10-08T00:00:00Z', daily_request_target: 100 })], runs })
    await stepPctRamps(dz, new Date('2026-10-07T06:00:00Z'), false)
    t('동결 중 정상 → 오르지 않는다', [dz.T.review_source_ramp[0].pct_step, dz.T.review_source_ramp[0].consecutive_ok_days], [50, 1])
    const dl = memDb({ ramp: [pctRow({ last_evaluated_date: '2026-10-05' })], runs, logError: { message: 'down' } })
    const nl = await stepPctRamps(dl, new Date('2026-10-07T06:00:00Z'), false)
    t('판정 로그 실패 → 갱신 0 + ❌', [dl.ops.filter(([, op]) => op === 'update').length, nl.some((n) => n.startsWith('❌'))], [0, true])
    const dd = memDb({ ramp: [pctRow({ last_evaluated_date: '2026-10-05' })], runs })
    const nd = await stepPctRamps(dd, new Date('2026-10-07T06:00:00Z'), true)
    t('판정 dry-run → 쓰기 0', [writes(dd), nd[0].startsWith('dry-run')], [0, true])
    const dx = memDb({ ramp: [pctRow({ source_key: 'todayhumor' }), pctRow({ source_key: 'danawa' })] })
    t('제외 소스 → 판정·쓰기 0', [await stepPctRamps(dx, new Date('2026-10-07T06:00:00Z'), false), writes(dx)], [[], 0])
  }
  {
    // 배분 B 집행: 타깃 있는 소스 합이 180분을 넘으면 몫으로 목표가 깎이고, 다음 날은 alloc 보류.
    const big = memDb({
      ramp: [pctRow({ cap_base: 10000, last_evaluated_date: '2026-10-05', consecutive_ok_days: 0 })],
      sources: [{ key: 'fmkorea', enabled: true, min_interval_ms: 3000, daily_request_cap: 10000 }, { key: 'clien', enabled: true, min_interval_ms: 5000, daily_request_cap: 462 }, { key: 'velog', enabled: true, min_interval_ms: 4000, daily_request_cap: 300 }],
      targets: [{ source_key: 'fmkorea', status: 'active' }, { source_key: 'clien', status: 'active' }],
      runs: [{ source_key: 'fmkorea', dry_run: false, started_at: '2026-10-06T05:40:00.000Z', ...okRow, requests: 5000 }],
    })
    await stepPctRamps(big, new Date('2026-10-07T06:00:00Z'), false)
    // fmkorea 10000×3s=30000s, clien 462×5s=2310s(타깃 없는 velog 는 분모 밖) → 10800 중 clien 2310, 나머지 8490s/3s = 2830 요청 몫
    t('배분: 몫 2830 × 50% → 목표 1415', big.T.review_source_ramp[0].daily_request_target, 1415)
    big.T.review_collection_runs.push({ source_key: 'fmkorea', dry_run: false, started_at: '2026-10-07T05:40:00.000Z', ...okRow, requests: 1415 })
    await stepPctRamps(big, new Date('2026-10-08T06:00:00Z'), false)
    t('배분 걸린 날 → alloc 보류(오르지 않음)', [big.T.review_source_ramp[0].pct_step, big.T.review_source_ramp_log.at(-1).reason.includes('alloc')], [50, true])
  }
  t('review-collect.mjs 가 소스 실행 전에 stepPctRamps 를 탄다', collect.indexOf('await stepPctRamps(') > 0 && collect.indexOf('await stepPctRamps(') < collect.indexOf('await collectWithRamp('), true)
}

console.log(`review-ramp-selftest: ${pass} pass, ${fail} fail`)
if (fail > 0) process.exit(1)
