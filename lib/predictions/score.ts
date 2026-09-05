// 예측 채점 엔진. `methodology/content/prediction-schema.md` 의 §1~§5 구현체다.
//
// 전부 순수 함수다 — 네트워크도 DB도 파일도 안 만진다. 그래야 픽스처로
// 검증할 수 있고, 채점이 틀렸을 때 "데이터가 이상한 건지 로직이 이상한 건지"를
// 가를 수 있다. DB 접근은 scripts/score-predictions.mjs 가 한다.
//
// ⚠️ 이 엔진의 핵심 규약은 **`무효`와 `보류`를 절대 섞지 않는 것**이다(§4-1).
// 방향이 반대면 무효, 차이가 노이즈 범위면 보류다. 섞으면 규칙 신뢰도가
// 오염되는데, 오염된 신뢰도는 틀린 값이 아니라 **틀렸는지 알 수 없는 값**이 된다.

// ── 지표 ──────────────────────────────────────────────────────
// §1-1. save_rate 는 없다 — Threads API 미제공(§7-2). 여기 넣으면 안 된다.
export const METRIC_WEIGHTS = {
  like_rate: 8,
  share_rate: 4,
  reply_rate: 2,
  views: 1,
} as const

export type MetricCode = keyof typeof METRIC_WEIGHTS

/** §1-1 계산식. 분모(views)가 0이면 비율은 정의되지 않는다 — null 을 준다. */
export function computeMetric(code: MetricCode, s: Snapshot): number | null {
  if (code === 'views') return s.views
  if (s.views === 0) return null
  switch (code) {
    case 'like_rate':  return s.likes / s.views
    case 'share_rate': return (s.reposts + s.quotes) / s.views
    case 'reply_rate': return s.replies / s.views
  }
}

export interface Snapshot {
  postId: string
  /** 발행 시각. 기준선의 "직전 K건"을 정렬하는 축이다. */
  publishedAt: string
  bucket: Horizon
  views: number
  likes: number
  replies: number
  reposts: number
  quotes: number
  /** 형식 태그. median_format_k 용. 없으면 그 기준선은 못 쓴다. */
  format?: string | null
}

export type Horizon = 'h1' | 'h24' | 'h168'
export type Direction = 'up' | 'down' | 'within'
export type BaselineCode =
  | 'median_last_k' | 'median_format_k' | 'median_all' | 'absolute' | 'paired'

export interface Prediction {
  metric: MetricCode
  direction: Direction
  baseline: BaselineCode
  threshold?: string     // '1.0mad' | '1.5mad' | '0.5mad' | '20pct'
  horizon: Horizon
  because: string
  rationale?: string
  k?: number
  format?: string
  value?: number | [number, number]
  pairedWith?: string
}

/** §4-1 판정 3상태. 이 셋 말고 다른 값은 없다. */
export type Verdict = '유효' | '무효' | '보류'

export interface ScoredMetric {
  metric: MetricCode
  verdict: Verdict
  actual: number | null
  baseline: number | null
  mad: number | null
  delta: number | null
  /** delta 를 임계 단위로 환산한 값. 사람이 보는 숫자다. */
  deltaInThreshold: number | null
  /** 보류·무효의 사유. 판정을 못 한 것과 틀린 것을 사후에 구분하려면 필요하다. */
  reason: string
  weight: number
}

// ── §2-2 임계 ─────────────────────────────────────────────────

export interface Threshold {
  kind: 'mad' | 'pct'
  factor: number
}

/** '1.0mad' / '20pct' 를 판다. 모르는 값은 던진다 — 조용히 기본값으로 넘어가면 채점 기준이 바뀐 걸 아무도 모른다. */
export function parseThreshold(raw: string | undefined): Threshold {
  const t = (raw ?? '1.0mad').trim()
  const mad = /^([0-9.]+)mad$/.exec(t)
  if (mad) return { kind: 'mad', factor: Number(mad[1]) }
  const pct = /^([0-9.]+)pct$/.exec(t)
  if (pct) return { kind: 'pct', factor: Number(pct[1]) / 100 }
  throw new Error(`알 수 없는 threshold: ${raw}`)
}

export function median(xs: number[]): number | null {
  if (xs.length === 0) return null
  const a = [...xs].sort((x, y) => x - y)
  const m = a.length >> 1
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2
}

/** §2-2 MAD. 표본이 전부 같은 값이면 0 이 나오고, 그때는 pct 로 폴백한다. */
export function mad(xs: number[]): number | null {
  const med = median(xs)
  if (med === null) return null
  return median(xs.map(x => Math.abs(x - med)))
}

// ── §2-3 부트스트랩 ───────────────────────────────────────────

export type Stage = 'bootstrap_hold' | 'bootstrap_ref' | 'full'

/** 발행 누적 건수로 단계를 가른다. n 은 **기준선 후보 건수**(당 건 제외)다. */
export function bootstrapStage(n: number): Stage {
  if (n < 4) return 'bootstrap_hold'
  if (n < 10) return 'bootstrap_ref'
  return 'full'
}

/** 참고 판정 구간의 신뢰도 가중치. §2-3. */
export const BOOTSTRAP_REF_WEIGHT = 0.5

// ── §4-1 단일 지표 판정 ───────────────────────────────────────

export const MIN_VIEWS = 100

export interface ScoreContext {
  /** 채점 대상 스냅샷 (예측의 horizon 버킷). */
  target: Snapshot
  /**
   * 기준선 후보. **대상 건은 빼고** 넣는다 — 자기 자신이 중앙값에 들어가면
   * 기준선이 대상 쪽으로 끌려와 차이가 작아진다.
   * 같은 horizon 버킷만 넣는다. h24 실측을 h168 기준선과 비교하면 안 된다.
   */
  history: Snapshot[]
  /** paired baseline 의 상대 스냅샷. 없으면 paired 는 확인 불가다. */
  paired?: Snapshot | null
}

export function scoreOne(p: Prediction, ctx: ScoreContext): ScoredMetric {
  const weight = METRIC_WEIGHTS[p.metric]
  const base = {
    metric: p.metric, weight,
    actual: null as number | null, baseline: null as number | null,
    mad: null as number | null, delta: null as number | null,
    deltaInThreshold: null as number | null,
  }

  // 2) 표본 부족. 0 이 아니라 "못 잰 것"이다.
  if (ctx.target.views < MIN_VIEWS) {
    return { ...base, verdict: '보류', reason: `표본 부족 (views ${ctx.target.views} < ${MIN_VIEWS})` }
  }

  const actual = computeMetric(p.metric, ctx.target)
  if (actual === null) {
    return { ...base, verdict: '보류', reason: '분모 0 — 비율 계산 불가' }
  }

  // ── direction: within 은 기준선·MAD 를 안 쓴다 (§3-3) ──
  if (p.direction === 'within') {
    if (!Array.isArray(p.value) || p.value.length !== 2) {
      return { ...base, actual, verdict: '보류', reason: 'within 인데 value 구간이 없다' }
    }
    const [lo, hi] = p.value
    const ok = actual >= lo && actual <= hi
    return {
      ...base, actual, baseline: null, verdict: ok ? '유효' : '무효',
      reason: ok
        ? `구간 [${lo}, ${hi}] 안`
        // 상한 초과도 무효다. 많이 나온 게 성공이 아니라는 걸 기계가 알아야 한다.
        : `구간 [${lo}, ${hi}] 밖 (${actual > hi ? '상한 초과' : '하한 미달'})`,
    }
  }

  // ── 기준선 ────────────────────────────────────────────────
  const resolved = resolveBaseline(p, ctx)
  if (resolved.baseline === null) {
    return { ...base, actual, verdict: '보류', reason: resolved.reason }
  }
  const baseline = resolved.baseline
  const delta = actual - baseline

  // ── 임계 ──────────────────────────────────────────────────
  let th = parseThreshold(p.threshold)
  const m = resolved.sample ? mad(resolved.sample) : null
  let cut: number
  let unit: string
  if (th.kind === 'mad') {
    if (m === null || m === 0) {
      // §2-2 폴백. MAD 0 은 "차이가 없다"가 아니라 "표본이 전부 같은 값"이다.
      th = parseThreshold('20pct')
      cut = Math.abs(baseline) * th.factor
      unit = 'pct(폴백)'
    } else {
      cut = m * th.factor
      unit = 'mad'
    }
  } else {
    cut = Math.abs(baseline) * th.factor
    unit = 'pct'
  }

  const deltaInThreshold = cut === 0 ? null : delta / cut
  const common = { ...base, actual, baseline, mad: m, delta, deltaInThreshold }

  if (cut === 0) {
    // 기준선도 0, MAD 도 0. 비교할 축이 없다.
    return { ...common, verdict: '보류', reason: '임계가 0 — 기준선·MAD 모두 0이라 비교 불가' }
  }

  // 6~7) 방향이 반대면 무효, 노이즈 범위면 보류.
  const passed = p.direction === 'up' ? delta >= cut : delta <= -cut
  if (passed) {
    return { ...common, verdict: '유효', reason: `임계 ${th.factor}${unit} 초과` }
  }
  const wrongWay = p.direction === 'up' ? delta <= -cut : delta >= cut
  if (wrongWay) {
    return { ...common, verdict: '무효', reason: `방향 반대 (${p.direction} 예측, 실측은 반대로 ${th.factor}${unit} 이상)` }
  }
  return { ...common, verdict: '보류', reason: `차이가 노이즈 범위 (|delta| < ${th.factor}${unit})` }
}

function resolveBaseline(
  p: Prediction, ctx: ScoreContext,
): { baseline: number | null; sample: number[] | null; reason: string } {
  const vals = (xs: Snapshot[]) =>
    xs.map(s => computeMetric(p.metric, s)).filter((v): v is number => v !== null)

  if (p.baseline === 'absolute') {
    if (typeof p.value !== 'number') {
      return { baseline: null, sample: null, reason: 'absolute 인데 value 가 숫자가 아니다' }
    }
    // 절대 기준선은 표본이 없다 → MAD 도 없다 → pct 로만 잰다.
    return { baseline: p.value, sample: null, reason: '' }
  }

  if (p.baseline === 'paired') {
    if (!ctx.paired) {
      // ★ 0건이 아니라 확인 불가다. 상대를 못 찾은 것을 "차이 없음"으로 접지 않는다.
      return { baseline: null, sample: null, reason: `paired 상대(${p.pairedWith ?? '미지정'})의 스냅샷을 못 찾음 — 확인 불가` }
    }
    const v = computeMetric(p.metric, ctx.paired)
    if (v === null) return { baseline: null, sample: null, reason: 'paired 상대의 분모가 0' }
    return { baseline: v, sample: null, reason: '' }
  }

  let pool = ctx.history
  if (p.baseline === 'median_format_k') {
    const fmt = p.format ?? ctx.target.format
    if (!fmt) return { baseline: null, sample: null, reason: 'median_format_k 인데 format 태그가 없다' }
    pool = pool.filter(s => s.format === fmt)
  }
  // 직전 K건 = 발행 시각 내림차순 K개. 정렬을 빼먹으면 "직전"이 아니라 "아무거나"가 된다.
  const sorted = [...pool].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
  const k = p.baseline === 'median_all' ? sorted.length : (p.k ?? 10)
  const sample = vals(sorted.slice(0, k))

  const stage = bootstrapStage(sample.length)
  if (stage === 'bootstrap_hold') {
    return { baseline: null, sample: null, reason: `부트스트랩 구간 — 기준선 표본 ${sample.length}건 (4건 미만은 채점하지 않는다)` }
  }
  const med = median(sample)
  if (med === null) return { baseline: null, sample: null, reason: '기준선 표본 없음 — 확인 불가' }
  return { baseline: med, sample, reason: '' }
}

// ── §4-3 복합 판정 ────────────────────────────────────────────

export interface ScoredEntry {
  logCode: string
  metrics: ScoredMetric[]
  score: number
  verdict: Verdict
  /** §2-3 참고 판정이면 0.5. 신뢰도 집계에서 이 값을 곱한다. */
  confidenceWeight: number
}

export function scoreEntry(logCode: string, preds: Prediction[], ctxOf: (p: Prediction) => ScoreContext): ScoredEntry {
  const metrics = preds.map(p => scoreOne(p, ctxOf(p)))
  const score = metrics.reduce(
    (acc, m) => acc + m.weight * (m.verdict === '유효' ? 1 : m.verdict === '무효' ? -1 : 0),
    0,
  )
  // 전부 보류면 score 0 이다. 그건 "종합 보류"이지 "무효 아님"이 아니다.
  const verdict: Verdict = score > 0 ? '유효' : score < 0 ? '무효' : '보류'

  // 기준선 표본이 부트스트랩 참고 구간이면 이 판정의 무게를 절반으로 둔다.
  const anyRef = metrics.some(m => m.mad !== null && m.baseline !== null)
  return { logCode, metrics, score, verdict, confidenceWeight: anyRef ? 1 : BOOTSTRAP_REF_WEIGHT }
}

// ── §5 규칙 신뢰도 ────────────────────────────────────────────

export interface RuleTally { valid: number; invalid: number; held: number }

/** `because` 기준으로 규칙에 귀속시킨다. 보류는 분모에 넣지 않는다(§5-2). */
export function tallyByRule(entries: { metrics: ScoredMetric[]; preds: Prediction[] }[]): Map<string, RuleTally> {
  const out = new Map<string, RuleTally>()
  for (const e of entries) {
    e.preds.forEach((p, i) => {
      const m = e.metrics[i]
      if (!m) return
      const t = out.get(p.because) ?? { valid: 0, invalid: 0, held: 0 }
      if (m.verdict === '유효') t.valid++
      else if (m.verdict === '무효') t.invalid++
      else t.held++
      out.set(p.because, t)
    })
  }
  return out
}

/** §5-2 Wilson score 하한(95%). n=0 이면 null — 0% 가 아니다. */
export function wilsonLower(valid: number, invalid: number): number | null {
  const n = valid + invalid
  if (n === 0) return null
  const z = 1.96
  const p = valid / n
  const denom = 1 + (z * z) / n
  const centre = p + (z * z) / (2 * n)
  const marginal = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))
  return (centre - marginal) / denom
}

export type RuleAction =
  | 'UPD 후보 생성'
  | '규칙 재검토'
  | '안정 규칙'
  | '예측 설계 재검토'
  | null

/** §5-3 자동 액션. 여러 조건이 겹치면 심각한 쪽을 먼저 낸다. */
export function ruleAction(t: RuleTally): RuleAction {
  const n = t.valid + t.invalid
  const lower = wilsonLower(t.valid, t.invalid)
  if (t.invalid >= 3) return 'UPD 후보 생성'
  if (n >= 5 && lower !== null && lower < 0.30) return '규칙 재검토'
  const total = n + t.held
  // 보류가 절반을 넘으면 규칙이 틀린 게 아니라 **측정이 틀린 것**이다.
  if (total >= 10 && t.held / total > 0.5) return '예측 설계 재검토'
  if (t.valid >= 10 && lower !== null && lower > 0.70) return '안정 규칙'
  return null
}
