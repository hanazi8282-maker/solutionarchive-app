// /analyze 목록의 정체 신호 셀프테스트 — 순수 계산만. 네트워크·DB 없음.
//   node scripts/analyze-list-signals-selftest.mjs
//
// 막는 회귀:
//   1. 상태별 기준 시각이 하나로 뭉쳐지는 것 — created_at 하나로 세면 어제 만들어
//      방금 분석이 끝난 프로젝트가 "오래 멈춤" 으로 찍힌다.
//   2. 시각을 못 읽은 행을 0일로 접는 것 — "방금 들어왔다"와 "모른다"는 다르다(§7.1).

import {
  DWELL_FIELD_LABEL, STALL_DAYS, STALL_STATUSES, dwellSince, funnelStats, stallOf,
} from '../lib/analysis/list-signals.ts'

let pass = 0, fail = 0
const t = (name, got, want) => {
  if (Object.is(got, want)) pass++
  else { fail++; console.log(`FAIL  ${name}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`) }
}

const NOW = Date.parse('2026-09-20T00:00:00Z')
const daysAgo = (n) => new Date(NOW - n * 86_400_000).toISOString()

t(`기준일 ${STALL_DAYS}일`, STALL_DAYS, 7)
t('정체를 보는 상태는 둘', STALL_STATUSES.join(','), 'extracted,processing')
t('기준 시각 이름표 3종', Object.keys(DWELL_FIELD_LABEL).length, 3)

// ── 1. 상태마다 기준 시각이 다르다 ───────────────────────────────────
const full = { created_at: daysAgo(30), extract_started_at: daysAgo(20), extract_finished_at: daysAgo(3) }
t('extracted → 분석 완료 시각', dwellSince({ status: 'extracted', ...full }).field, 'extract_finished_at')
t('processing → 분석 시작 시각', dwellSince({ status: 'processing', ...full }).field, 'extract_started_at')
t('collecting → 생성 시각', dwellSince({ status: 'collecting', ...full }).field, 'created_at')
t('processing 은 완료 시각을 쓰지 않는다', dwellSince({ status: 'processing', ...full }).field !== 'extract_finished_at', true)

// 폴백: extracted 인데 완료 시각이 없으면 시작 시각 → 생성 시각 순
t('extracted + 완료 시각 없음 → 시작 시각',
  dwellSince({ status: 'extracted', created_at: daysAgo(30), extract_started_at: daysAgo(20), extract_finished_at: null }).field,
  'extract_started_at')
t('extracted + 둘 다 없음 → 생성 시각',
  dwellSince({ status: 'extracted', created_at: daysAgo(30) }).field, 'created_at')

// ── 2. 정체 판정 ─────────────────────────────────────────────────────
t('검수 대기 8일 → 멈춤', stallOf({ status: 'extracted', extract_finished_at: daysAgo(8) }, NOW).stalled, true)
t('검수 대기 7일 → 멈춤(경계 포함)', stallOf({ status: 'extracted', extract_finished_at: daysAgo(7) }, NOW).stalled, true)
t('검수 대기 6일 → 아직 아니다', stallOf({ status: 'extracted', extract_finished_at: daysAgo(6) }, NOW).stalled, false)
t('분석 중 9일 → 멈춤', stallOf({ status: 'processing', extract_started_at: daysAgo(9) }, NOW).stalled, true)
t('수집 중 300일 → 멈춤 아님(대상 상태가 아니다)', stallOf({ status: 'collecting', created_at: daysAgo(300) }, NOW).stalled, false)
t('완료 300일 → 멈춤 아님', stallOf({ status: 'done', created_at: daysAgo(300) }, NOW).stalled, false)

// 어제 만들어 방금 분석이 끝난 프로젝트 — created_at 하나로 세던 시절의 오탐
t('어제 생성 + 방금 분석 완료 → 멈춤 아님',
  stallOf({ status: 'extracted', created_at: daysAgo(1), extract_finished_at: daysAgo(0) }, NOW).stalled, false)
// 반대로 오래 전에 만들어 오래 전에 끝난 것은 잡는다
t('30일 전 생성 + 10일 전 완료 → 멈춤 10일',
  stallOf({ status: 'extracted', created_at: daysAgo(30), extract_finished_at: daysAgo(10) }, NOW).days, 10)

// ── 3. 확인 불가를 0 으로 접지 않는다 ────────────────────────────────
const noTime = stallOf({ status: 'extracted' }, NOW)
t('시각 없음 → days null', noTime.days, null)
t('시각 없음 → field null', noTime.field, null)
t('시각 없음 → 멈춤으로 단정하지 않는다', noTime.stalled, false)
t('깨진 시각 문자열도 확인 불가', stallOf({ status: 'extracted', extract_finished_at: 'not-a-date' }, NOW).days, null)

// ── 4. 상태별 건수 + 최장 체류 ───────────────────────────────────────
const rows = [
  { status: 'extracted', extract_finished_at: daysAgo(5) },
  { status: 'extracted', extract_finished_at: daysAgo(2) },
  { status: 'extracted' },                                  // 시각 없음
  { status: 'processing', extract_started_at: daysAgo(1) },
  { status: 'collecting', created_at: daysAgo(9) },
]
const f = funnelStats(rows, NOW)
t('상태 3종', f.length, 3)
t('순서는 입력 순서', f.map((e) => e.status).join(','), 'extracted,processing,collecting')
t('검수 대기 3건', f[0].count, 3)
t('검수 대기 최장 5일', f[0].longestDays, 5)
t('최장 체류의 기준 시각을 말한다', f[0].longestField, 'extract_finished_at')
t('시각 없는 1건은 따로 센다', f[0].unknown, 1)
t('시각 없는 행이 최장을 가리지 않는다', f[0].longestDays, 5)
t('분석 중 1건 · 1일', `${f[1].count}/${f[1].longestDays}`, '1/1')
t('수집 중 9일도 센다(정체 배지는 안 붙어도)', f[2].longestDays, 9)

const allUnknown = funnelStats([{ status: 'extracted' }, { status: 'extracted' }], NOW)
t('전부 시각 없음 → 최장 null(0 아님)', allUnknown[0].longestDays, null)
t('전부 시각 없음 → 건수는 센다', allUnknown[0].count, 2)
t('빈 목록 → 빈 배열', funnelStats([], NOW).length, 0)

console.log(fail ? `실패 ${fail}건 / 통과 ${pass}건` : `통과 ${pass}건 — 상태별 기준 시각 · 정체 경계 ${STALL_DAYS}일 · 확인 불가 3상태 · 상태별 건수/최장 체류`)
process.exitCode = fail ? 1 : 0
