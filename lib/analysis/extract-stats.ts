// 추출 소요시간 실측 — "분석 시작" 옆에 "얼마나 걸리나" 를 붙인다 (docs/pmf-product-design.md §3-2).
//
// ★ 표본 없이 숫자를 보여주지 않는다. 5건 미만이면 중앙값을 내지 않고 "측정 전(표본 N건)" 이라고 말한다.
//   3~4건의 중앙값은 다음 한 건에 두 배로 흔들린다 — 그런 숫자는 없느니만 못하다.
// ★ 조회 실패와 "표본 0건" 은 다른 사건이다(§7.1). 여기는 순수 함수라 실패를 모르고,
//   호출부(app/api/analyze/extract/route.ts)가 조회 실패를 500 으로 가른다.
//
// 이 파일은 Node 가 타입 스트리핑으로 직접 로드한다(셀프테스트). `@/` 별칭·enum 을 쓰지 않는다.

/** 이 아래면 중앙값을 내지 않는다. */
export const MIN_SAMPLES = 5

export interface ExtractStats {
  samples: number
  /** 표본이 MIN_SAMPLES 미만이면 null — 0 이 아니라 "아직 못 낸다". */
  median_seconds: number | null
  p90_seconds: number | null
}

export interface ExtractTimingRow {
  extract_started_at: string | null
  extract_finished_at: string | null
}

/** 시작·종료가 둘 다 있고 순서가 맞는 행만 초 단위 길이로. 나머지는 버린다(0 으로 접지 않는다). */
export function durationsSeconds(rows: ExtractTimingRow[] | null | undefined): number[] {
  if (!rows) return []
  const out: number[] = []
  for (const r of rows) {
    const a = r.extract_started_at ? Date.parse(r.extract_started_at) : NaN
    const b = r.extract_finished_at ? Date.parse(r.extract_finished_at) : NaN
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue
    const sec = (b - a) / 1000
    if (sec > 0) out.push(sec)
  }
  return out
}

/** 선형보간 분위수. 짝수 개 중앙값은 가운데 두 값의 평균이 된다(app/api/analyze/review/route.ts 의 median 과 같은 뜻). */
export function quantile(values: number[], p: number): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  if (s.length === 1) return s[0]
  const pos = (s.length - 1) * Math.min(Math.max(p, 0), 1)
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (pos - lo)
}

export function extractStats(rows: ExtractTimingRow[] | null | undefined): ExtractStats {
  const d = durationsSeconds(rows)
  if (d.length < MIN_SAMPLES) return { samples: d.length, median_seconds: null, p90_seconds: null }
  const round = (v: number | null) => (v === null ? null : Math.round(v))
  return { samples: d.length, median_seconds: round(quantile(d, 0.5)), p90_seconds: round(quantile(d, 0.9)) }
}

/** 화면 한 줄. 숫자를 낼 때도 표본 수를 뺀 문장을 만들지 않는다. */
export function extractStatsLabel(stats: ExtractStats | null | undefined): string {
  if (!stats) return '예상 소요시간 확인 불가 — 측정값을 읽지 못했다'
  if (stats.median_seconds === null) return `예상 소요시간 측정 전(표본 ${stats.samples}건)`
  const p90 = stats.p90_seconds === null ? '' : ` · 느리면 ${stats.p90_seconds}초`
  return `보통 ${stats.median_seconds}초${p90} (표본 ${stats.samples}건)`
}
