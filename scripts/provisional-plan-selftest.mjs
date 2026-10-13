#!/usr/bin/env node
// B② 안전장치 계획 셀프테스트 — 순수 함수. DB·네트워크 없음.
import { main as planMain, loadPlanState, VERIFIED_VER } from './provisional-plan.mjs'
import { KILL_FP_RATE, KILL_MIN_AUDIT, PLAN_AREA_CAP_EARLY, PLAN_DAILY_TOTAL_CAP, PLAN_FIRST_VERIFY, killSwitch, planRegistration } from '../lib/review/provisional-plan.ts'

let pass = 0
let fail = 0
const t = (name, got, want) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++
  else {
    fail++
    console.log(`FAIL  ${name}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`)
  }
}
const A = { state: 'anchored', appId: 1, trackName: 'x', sellerName: 's', domain: null, ratingCount: 100, reason: '앱 1 평가 100건' }
const c = (key, area, anchor = A) => ({ key, name: key.toUpperCase(), status: 'adopt', area, areaShare: 0.9, tier: 'small', anchor })
const st = (o = {}) => ({ registeredToday: {}, registeredTotal: 0, humanVerifiedTotal: 0, audit: null, ...o })
const act = (r) => r.decisions.map((d) => d.action)

// 처음(사람 검증 0): 앵커 일치도 전부 human_verify — 자동 등록 0
{
  const r = planRegistration([c('aaaa', '1'), c('bbbb', '2')], st())
  t('첫 10건: 앵커 일치해도 사람 검증 대기', act(r), ['human_verify', 'human_verify'])
  t('첫 10건: 킬스위치는 ok(자동 등록이 닫혀 있다)', r.kill.state, 'ok')
}
// 앵커 실패는 어떤 상태든 skip(3상태 구분 사유)
{
  const bad = [
    c('ambi', '1', { state: 'ambiguous', reason: '판매자 둘' }),
    c('nomt', '1', { state: 'no_match', reason: '없음' }),
    c('fail', '1', { state: 'lookup_failed', reason: 'HTTP 503' }),
  ]
  const r = planRegistration(bad, st())
  t('앵커 ambiguous·no_match·lookup_failed 는 전부 skip', act(r), ['skip', 'skip', 'skip'])
  t('사유에 앵커 상태가 남는다', r.decisions.map((d) => d.reason.split(' ')[1]), ['ambiguous', 'no_match', 'lookup_failed'])
}
// 자동 등록 열림: 사람 검증 10건 + 감사 n≥20·오탐 ≤20%
const open = st({ humanVerifiedTotal: PLAN_FIRST_VERIFY, registeredTotal: 12, audit: { n: 25, falsePositive: 5 } })
t('감사 n=25·오탐 20% 는 정지 아님(경계)', killSwitch(open).state, 'ok')
t('열림: 앵커 일치 → register', act(planRegistration([c('aaaa', '1')], open)), ['register'])
t('감사 오탐 21% 이상 → 정지(전부 skip)', act(planRegistration([c('aaaa', '1')], st({ ...open, audit: { n: 100, falsePositive: 21 } }))), ['skip'])
t('감사 n<20 → 확인 불가 · 자동 등록 0(사람 확인으로)', [killSwitch(st({ ...open, audit: { n: KILL_MIN_AUDIT - 1, falsePositive: 0 } })).state, act(planRegistration([c('aaaa', '1')], st({ ...open, audit: { n: 5, falsePositive: 0 } })))], ['unknown', ['human_verify']])
t('감사 표본 없음(null) → 확인 불가', killSwitch(st({ ...open, audit: null })).state, 'unknown')
t('오탐률 상수 20%', KILL_FP_RATE, 0.2)

// 상한: 영역 5 · 총 15 · 오늘 이미 쓴 몫을 뺀다
{
  const many = Array.from({ length: 8 }, (_, i) => c(`prod${i}x`, '1'))
  const r = planRegistration(many, open)
  // 영역 상한 5 가 먼저 걸려 5건이 계획되지만, 한 영역이 계획의 100% 라 비율 상한(40%)이 2건으로 더 줄인다 — 쏠림을 후보 부족으로 풀지 않는다.
  t(`영역 상한 ${PLAN_AREA_CAP_EARLY} → 비율 상한 40%: 한 영역만 8개면 5 → 2건`, [act(r).filter((x) => x === 'register').length, r.counts.skip], [2, 6])
  const r2 = planRegistration(many, st({ ...open, registeredToday: { 1: 3 } }))
  t('오늘 이미 3개 등록 → 2개만', act(r2).filter((x) => x === 'register').length, 2)
  const spread = ['1', '2', '3', '4', '5'].flatMap((a) => Array.from({ length: 5 }, (_, i) => c(`p${a}${i}xx`, a)))
  const r3 = planRegistration(spread, st({ ...open, registeredToday: { 1: 0 } }))
  t(`총 상한 ${PLAN_DAILY_TOTAL_CAP}`, r3.counts.register + r3.counts.human_verify <= PLAN_DAILY_TOTAL_CAP, true)
}
// 비율 상한 40%: 계획 ≥5건에서 한 영역이 40% 를 넘으면 뒤쪽을 내린다
{
  const mix = [...Array.from({ length: 4 }, (_, i) => c(`aa${i}xx`, '1')), ...Array.from({ length: 3 }, (_, i) => c(`bb${i}xx`, '2')), c('cc0xx', '3')]
  const r = planRegistration(mix, open)
  const byArea = (a) => r.decisions.filter((d) => d.area === a && d.action !== 'skip').length
  t('계획 8건 → 영역당 ≤3(40%)', [byArea('1') <= 3, byArea('2') <= 3], [true, true])
  t('비율 상한 사유가 남는다', r.decisions.some((d) => d.reason.includes('비율 상한')), true)
}
t('입력과 같은 길이·순서', planRegistration([c('zzzz', '1'), c('yyyy', '2')], open).decisions.map((d) => d.key), ['zzzz', 'yyyy'])

// ── 실행부: 가짜 DB·가짜 앵커 조회·가짜 후보
import os from 'node:os'
import fs from 'node:fs'
import path from 'node:path'
{
  const row = (key, area) => ({ key, name: key[0].toUpperCase() + key.slice(1), status: 'adopt', area, areaShare: 0.9, tier: 'small', posts: 8, sources: 3 })
  const sbWith = (data, error = null) => ({ from: () => ({ select: () => ({ in: () => ({ limit: () => Promise.resolve({ data, error }) }) }) }) })
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pplan-'))
  const log = () => {}
  const lookupFn = async (name) => (name === 'Zorbaone' ? A : { state: 'no_match', reason: '없음' })
  const r = await planMain(['--max=5'], { sb: sbWith([]), candidates: async () => ({ rows: [row('zorbaone', '1'), row('quuxtwo', '2')] }), lookupFn, now: new Date('2026-10-14T03:00:00Z'), reportsDir: tmp, log, sleepMs: 0 })
  t('실행부: 앵커 일치 1 → 사람 확인 대기(첫 10건), 불일치 1 → 제외', [r.plan.counts.human_verify, r.plan.counts.skip, r.plan.counts.register], [1, 1, 0])
  t('실행부: 보고서 파일을 썼다', fs.existsSync(path.join(tmp, '2026-10-14', 'provisional-plan.md')), true)
  let err = ''
  try { await planMain([], { sb: sbWith(null, { code: 'X', message: 'down' }), candidates: async () => ({ rows: [row('zorbaone', '1')] }), lookupFn, reportsDir: tmp, log, sleepMs: 0 }) } catch (e) { err = e.message }
  t('상태 조회 실패는 던진다(0건으로 접지 않는다)', err.includes('상태 조회 실패'), true)
  const state = await loadPlanState(sbWith([{ area_code: '1', area_rule_ver: VERIFIED_VER, created_at: '2026-10-14T01:00:00Z' }, { area_code: '2', area_rule_ver: 'prov-v1', created_at: '2026-10-10T01:00:00Z' }]), '2026-10-14')
  t('상태: 오늘 등록은 KST 날짜 기준 · 사람 검증은 :verified 만', [state.state.registeredToday, state.state.humanVerifiedTotal, state.state.registeredTotal], [{ 1: 1 }, 1, 2])
  fs.rmSync(tmp, { recursive: true, force: true })
}

console.log(`provisional-plan selftest: ${pass} pass / ${fail} fail`)
process.exit(fail ? 1 : 0)
