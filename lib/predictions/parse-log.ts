// 판정 로그(`methodology/content/<solfa|pdp>/04-decisions.md` §4)에서
// 예측 블록을 뽑는다. 정본은 append-only 마크다운이고 그게 유일한 진실이다 —
// DB 로 옮기지 않는다(prediction-schema.md §7-3 (C) 거부 사유).
//
// ⚠️ 파서가 못 읽은 엔트리를 **"예측 없음"으로 접지 않는다.** 형식이 깨진
// 엔트리는 `errors` 로 올린다. 조용히 건너뛰면 예측을 써 놓고도 채점되지
// 않는 엔트리가 생기고, 그건 로그에는 "예측 0건"으로만 보인다 (CLAUDE.md §7.1).

import type { Prediction, MetricCode, Direction, BaselineCode, Horizon } from './score.ts'
import { METRIC_WEIGHTS } from './score.ts'

export interface LogEntry {
  code: string
  title: string
  /** 이 엔트리가 온 파일. 어느 아카이브 소속인지 사후 추적용. */
  source: string
  predictions: Prediction[]
}

export interface ParseResult {
  entries: LogEntry[]
  /** 형식이 깨져서 못 읽은 것. 비어 있지 않으면 채점 결과를 신뢰하면 안 된다. */
  errors: { code: string; message: string }[]
}

const LOG_CODE = /^###\s+((?:LOG|UPD|NEW|XUP)-\d{8}-\d{2})\s*(?:\|\s*(.*))?$/
const REQUIRED = ['metric', 'direction', 'baseline', 'threshold', 'horizon', 'because'] as const

const DIRECTIONS: Direction[] = ['up', 'down', 'within']
const BASELINES: BaselineCode[] = ['median_last_k', 'median_format_k', 'median_all', 'absolute', 'paired']
const HORIZONS: Horizon[] = ['h1', 'h24', 'h168']

export function parseDecisionLog(markdown: string, source: string): ParseResult {
  const lines = markdown.split(/\r?\n/)
  const entries: LogEntry[] = []
  const errors: ParseResult['errors'] = []

  // 템플릿 코드블록(``` 안의 LOG-YYYYMMDD-nn)을 실제 엔트리로 세면 안 된다.
  // 04-decisions.md 는 §4 맨 위에 엔트리 템플릿을 코드블록으로 두고 있다.
  let inFence = false
  const starts: number[] = []
  lines.forEach((ln, i) => {
    if (/^\s*```/.test(ln)) { inFence = !inFence; return }
    if (inFence) return
    if (LOG_CODE.test(ln)) starts.push(i)
  })

  for (let i = 0; i < starts.length; i++) {
    const start = starts[i]
    const end = i + 1 < starts.length ? starts[i + 1] : lines.length
    const m = LOG_CODE.exec(lines[start])!
    const code = m[1]
    const title = (m[2] ?? '').trim()
    const body = lines.slice(start + 1, end)

    let predictions: Prediction[] = []
    try {
      predictions = extractPredictions(body)
    } catch (e) {
      errors.push({ code, message: e instanceof Error ? e.message : String(e) })
      continue
    }
    entries.push({ code, title, source, predictions })
  }

  return { entries, errors }
}

/**
 * `예측:` 아래의 YAML 유사 블록을 판다. 정식 YAML 파서를 안 쓰는 이유는
 * 이 레포에 yaml 의존성이 없고, 여기서 필요한 문법이 "들여쓴 `- key: value`"
 * 하나뿐이기 때문이다. 대신 **모르는 문법을 만나면 던진다** — 조용히 무시하면
 * 예측을 써 놓고도 안 채점되는 엔트리가 생긴다.
 */
export function extractPredictions(bodyLines: string[]): Prediction[] {
  const startIdx = bodyLines.findIndex(l => /^\s*(?:-\s*)?\*{0,2}예측\*{0,2}\s*:\s*$/.test(l))
  if (startIdx < 0) return []      // 예측 칸이 아예 없는 엔트리(역방향 등)는 정상이다.

  const out: Prediction[] = []
  let cur: Record<string, string> | null = null

  const flush = () => {
    if (cur) out.push(toPrediction(cur))
    cur = null
  }

  for (let i = startIdx + 1; i < bodyLines.length; i++) {
    const raw = bodyLines[i]
    if (raw.trim() === '') continue
    // 들여쓰기가 풀리면 예측 블록이 끝난 것이다.
    if (!/^\s{2,}/.test(raw)) break
    if (/^\s*```/.test(raw)) break

    const item = /^\s*-\s*([A-Za-z_]+)\s*:\s*(.*)$/.exec(raw)
    if (item) { flush(); cur = { [item[1]]: item[2].trim() }; continue }

    const field = /^\s*([A-Za-z_]+)\s*:\s*(.*)$/.exec(raw)
    if (field) {
      if (!cur) throw new Error(`예측 항목이 '-' 로 시작하지 않는다: ${raw.trim()}`)
      cur[field[1]] = field[2].trim()
      continue
    }
    throw new Error(`예측 블록에서 알 수 없는 줄: ${raw.trim()}`)
  }
  flush()
  return out
}

function toPrediction(o: Record<string, string>): Prediction {
  for (const f of REQUIRED) {
    if (!o[f]) throw new Error(`필수 필드 누락: ${f} (있는 필드: ${Object.keys(o).join(', ')})`)
  }
  const metric = stripComment(o.metric)
  if (!(metric in METRIC_WEIGHTS)) {
    // save_rate 를 그대로 쓴 예측이 여기 걸린다. 전량 보류로 흘려보내지 않고
    // 즉시 에러를 낸다 — 보류로 빠지면 "측정이 안 된" 것처럼 보인다.
    throw new Error(`알 수 없는 metric: ${metric} (쓸 수 있는 것: ${Object.keys(METRIC_WEIGHTS).join(', ')})`)
  }
  const direction = stripComment(o.direction) as Direction
  if (!DIRECTIONS.includes(direction)) throw new Error(`알 수 없는 direction: ${direction}`)

  // baseline 은 median_last_10 처럼 K 가 붙어 들어온다. 코드와 K 를 분리한다.
  const rawBaseline = stripComment(o.baseline)
  let baseline = rawBaseline as BaselineCode
  let k: number | undefined
  const withK = /^(median_last|median_format)_(\d+)$/.exec(rawBaseline)
  if (withK) {
    baseline = `${withK[1]}_k` as BaselineCode
    k = Number(withK[2])
  }
  if (!BASELINES.includes(baseline)) throw new Error(`알 수 없는 baseline: ${rawBaseline}`)

  const horizon = stripComment(o.horizon) as Horizon
  if (!HORIZONS.includes(horizon)) throw new Error(`알 수 없는 horizon: ${horizon}`)

  const p: Prediction = {
    metric: metric as MetricCode,
    direction,
    baseline,
    threshold: stripComment(o.threshold),
    horizon,
    because: stripComment(o.because),
    rationale: o.rationale ? unquote(o.rationale) : undefined,
  }
  if (k !== undefined) p.k = k
  if (o.k) p.k = Number(stripComment(o.k))
  if (o.format) p.format = unquote(o.format)
  if (o.paired_with) p.pairedWith = stripComment(o.paired_with)
  if (o.value) p.value = parseValue(stripComment(o.value))

  if (direction === 'within' && !Array.isArray(p.value)) {
    throw new Error(`direction: within 인데 value 가 [하한, 상한] 구간이 아니다: ${o.value ?? '(없음)'}`)
  }
  if (baseline === 'absolute' && typeof p.value !== 'number' && !Array.isArray(p.value)) {
    throw new Error(`baseline: absolute 인데 value 가 없다`)
  }
  if (baseline === 'paired' && !p.pairedWith) {
    throw new Error(`baseline: paired 인데 paired_with 가 없다`)
  }
  return p
}

/** `h168              # §1-2` 처럼 붙는 주석을 뗀다. */
function stripComment(v: string): string {
  return v.replace(/\s+#.*$/, '').trim()
}

function unquote(v: string): string {
  // 프로젝트 target 이 ES2017 이라 s 플래그를 못 쓴다. [\s\S] 로 대신한다.
  return stripComment(v).replace(/^"([\s\S]*)"$/, '$1').replace(/^'([\s\S]*)'$/, '$1')
}

function parseValue(v: string): number | [number, number] {
  const arr = /^\[\s*([0-9.eE+-]+)\s*,\s*([0-9.eE+-]+)\s*\]$/.exec(v)
  if (arr) return [Number(arr[1]), Number(arr[2])]
  const n = Number(v)
  if (Number.isNaN(n)) throw new Error(`value 를 못 읽음: ${v}`)
  return n
}
