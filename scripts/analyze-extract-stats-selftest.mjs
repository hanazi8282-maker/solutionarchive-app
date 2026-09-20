#!/usr/bin/env node
// 추출 소요시간 통계 셀프테스트 — lib/analysis/extract-stats.ts. 네트워크·DB 없음.
//   node scripts/analyze-extract-stats-selftest.mjs
//
// 이 검사가 있는 이유: 화면에 "보통 40초" 라고 적히는 숫자다. 표본이 3건인데 중앙값을
// 내보내면 사용자는 그게 측정값인 줄 안다. 표본 하한과 "못 읽은 것"의 문장을 고정한다(§7.1).

import { MIN_SAMPLES, durationsSeconds, quantile, extractStats, extractStatsLabel } from '../lib/analysis/extract-stats.ts'

let pass = 0, fail = 0
const t = (name, got, want) => { if (Object.is(got, want)) pass++; else { fail++; console.log(`FAIL  ${name}\n      got=${JSON.stringify(got)} want=${JSON.stringify(want)}`) } }

const row = (startIso, sec) => ({
  extract_started_at: startIso,
  extract_finished_at: new Date(Date.parse(startIso) + sec * 1000).toISOString(),
})
const rows = (...secs) => secs.map((s, i) => row(`2026-09-${String(i + 1).padStart(2, '0')}T00:00:00Z`, s))

// ── 길이 뽑기 ──
t('시작·종료 둘 다 있어야 센다', durationsSeconds([{ extract_started_at: '2026-09-01T00:00:00Z', extract_finished_at: null }]).length, 0)
t('파싱 불가 시각은 버린다', durationsSeconds([{ extract_started_at: 'nope', extract_finished_at: 'nope' }]).length, 0)
t('종료가 시작보다 앞이면 버린다 (0 으로 접지 않는다)', durationsSeconds(rows(-30)).length, 0)
t('정상 행은 초로', durationsSeconds(rows(42))[0], 42)
t('null 입력 → 빈 배열', durationsSeconds(null).length, 0)

// ── 분위수 ──
t('빈 배열 → null (0 아님)', quantile([], 0.5), null)
t('홀수 중앙값', quantile([1, 2, 3], 0.5), 2)
t('짝수 중앙값 = 가운데 둘의 평균', quantile([1, 2, 3, 4], 0.5), 2.5)
t('p90 은 위쪽 끝을 향한다', quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9), 9.1)
t('p100 = 최댓값', quantile([1, 5, 9], 1), 9)

// ── 집계 ──
const few = extractStats(rows(10, 20, 30, 40))
t('표본 4건 → 중앙값 없음', few.median_seconds, null)
t('표본 4건 → 표본 수는 그대로 준다', few.samples, 4)
t('하한은 5건', MIN_SAMPLES, 5)
const enough = extractStats(rows(10, 20, 30, 40, 50))
t('표본 5건 → 중앙값 30', enough.median_seconds, 30)
t('표본 5건 → p90 46 (정수 반올림)', enough.p90_seconds, 46)
t('표본 수를 같이 돌려준다', enough.samples, 5)
t('버려진 행은 표본에서 빠진다', extractStats([...rows(10, 20, 30, 40, 50), { extract_started_at: null, extract_finished_at: null }]).samples, 5)

// ── 문장 ──
t('표본 부족이면 "측정 전" 과 표본 수', extractStatsLabel(few), '예상 소요시간 측정 전(표본 4건)')
t('숫자에는 항상 표본 수가 붙는다', /표본 \d+건/.test(extractStatsLabel(enough)), true)
t('못 읽었으면 확인 불가 (0초 아님)', extractStatsLabel(null), '예상 소요시간 확인 불가 — 측정값을 읽지 못했다')

console.log(`\n통과 ${pass}건${fail ? `, 실패 ${fail}건` : ''}`)
if (fail) process.exit(1)
console.log('소요시간 통계 정상 — 표본 5건 미만이면 숫자를 내지 않는다.')
