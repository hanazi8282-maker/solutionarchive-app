#!/usr/bin/env node
// bottleneck-report 셀프테스트 — 순수함수만. 네트워크·DB·env 없음.
//   1) 앱스토어 활성 0 이어도 방문·요청·신규를 24h 실행에서 센다(휴지 상태를 '읽을 곳 0'으로 오독하지 않는다)
//   2) 30% 게이트 막은 건수 = gap − gate_headroom (여유가 gap 이상이면 0)
//   3) 목표 90% 이상만 '근접', 100% 이상은 '도달'
//   4) 못 읽은 값(registered24=null)은 0 이 아니라 '확인 불가'
import assert from 'node:assert/strict'
import { bottleneckBlock } from './bottleneck-report.mjs'

const src = (k, o = {}) => ({ source_key: k, active: 0, N: 10, gap: 0, gate_headroom: 5, inactive: { exhausted: 0 }, ...o })
const report = {
  googleplay: { frozen_at: 80, expand_ready: false },
  sources: [src('appstore', { inactive: { exhausted: 223 }, gap: 12, gate_headroom: 7 }), src('googleplay', { active: 58 }), src('github_issues', { gap: 3, gate_headroom: 9 })],
}
const runs24 = [
  { source_key: 'appstore', requests: 131, targets_visited: 72, new_reviews: 2623, blocked_responses: 0, quota_responses: 0 },
  { source_key: 'github_issues', requests: 60, targets_visited: 12, new_reviews: 2674, blocked_responses: 1, quota_responses: 0 },
  { source_key: 'googleplay', requests: 46, targets_visited: 46, new_reviews: 15, blocked_responses: 0, quota_responses: 0 },
]
const dailyTarget = { appstore: 120, github_issues: 60, googleplay: 63 }

const b = bottleneckBlock({ date: '2026-10-18', report, runs24, dailyTarget, registered24: 22 })
assert.match(b, /^\[병목 2026-10-18\]/)
assert.match(b, /활성 0 \/ 필요 10 \/ 30% 여유 7 · 24h 방문 72 요청 131 신규 2623/) // 1
assert.match(b, /여유 초과분[^:]*: 5 \(appstore 5\)/) // 2 — gap 12 − 여유 7, github(3<9)는 0
assert.match(b, /appstore 131\/120 도달/) // 3
assert.match(b, /github_issues 60\/60 도달/)
assert.doesNotMatch(b, /googleplay 46\/63/) // 73% — 근접 아님
assert.match(b, /차단 1 · 쿼터 0/)
assert.match(b, /등록 속도\(24h 새 타깃\): 22/)

const b2 = bottleneckBlock({ date: '2026-10-18', report, runs24, dailyTarget, registered24: null })
assert.match(b2, /등록 속도\(24h 새 타깃\): 확인 불가/) // 4

console.log('✅ bottleneck-report selftest 통과')
