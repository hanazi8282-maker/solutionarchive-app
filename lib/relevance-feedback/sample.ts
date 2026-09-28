// 관련성 판정 기준 피드백 — 층화 표본·층별 일치율·채점 입력 검증. 순수 모듈(DB·시계·네트워크 없음).
// 화면: /relevance/grade(하루 한 묶음 채점), /relevance/feedback(층별 요약). 셀프테스트: scripts/relevance-feedback-selftest.mjs.
//
// 왜 층을 나누나(남헌 2026-09-28): "기준을 통과한 것과 완전히 무관한 것을 조금씩 섞어 보며 기준이 제대로 도는지 판단".
//   A 자동승인 통과(rr-v2) — 기준이 맞는지(정밀도)      B 관련이지만 정보 없음 — 경계
//   C 1차·2차 불일치 — 기준이 모호한 곳                   D 둘 다 무관 — 놓치는 것(재현율)
//
// 컬럼 3상태(§7.1): second_verdict(000027)·product_informative 둘(000031)이 없는 DB 가 있다. 없는 층은
//   "확인 불가"로 표시하고 나머지 층으로 채운다 — 0 건으로 접지 않는다.
//
// ⚠️ Node 가 타입 스트리핑으로 직접 로드한다(셀프테스트). `@/` 별칭·enum 을 쓰지 않는다.

import { meetsRrV2 } from '../analysis/auto-approval.ts'

export type Stratum = 'A' | 'B' | 'C' | 'D'
export const STRATA: readonly Stratum[] = ['A', 'B', 'C', 'D']

export const STRATUM_LABEL: Readonly<Record<Stratum, string>> = {
  A: 'A 자동승인 통과(rr-v2)',
  B: 'B 관련이지만 정보 없음',
  C: 'C 1차·2차 불일치',
  D: 'D 둘 다 무관',
}

/**
 * 하루 한 묶음 배분. 근거: A 가 사람 검토를 없앤 자리라 제일 많이(정밀도 감시 = 킬스위치와 같은 데이터),
 * B·C 는 기준을 고칠 재료가 나오는 경계, D 는 대부분 정말 무관이라 적게(놓침 탐지용).
 */
export const DEFAULT_QUOTA: Readonly<Record<Stratum, number>> = { A: 6, B: 4, C: 3, D: 2 }
export const BATCH_SIZE = 15
export const NOTE_MAX = 1000

export type Verdict = 'relevant' | 'irrelevant' | 'unknown'
export const VERDICTS: readonly Verdict[] = ['relevant', 'irrelevant', 'unknown']

export interface FeedbackRow {
  input_id: string
  project_id?: string | null
  verdict: string | null
  second_verdict?: string | null
  product_informative?: boolean | null
  second_product_informative?: boolean | null
  human_verdict?: string | null
  human_product_informative?: boolean | null
  human_graded_at?: string | null
}

/** true 있음 · false 없음(마이그 미적용) · null 확인 불가(행이 0 이라 모른다). */
export interface Availability {
  second: boolean | null
  informative: boolean | null
}

/** select('*') 결과의 키로 컬럼 유무를 본다. 행이 없으면 모른다(null) — "없음"으로 접지 않는다. */
export function columnAvailability(rows: readonly object[]): Availability {
  if (rows.length === 0) return { second: null, informative: null }
  const r = rows[0]
  return {
    second: 'second_verdict' in r,
    informative: 'product_informative' in r && 'second_product_informative' in r,
  }
}

/** 이 층을 가를 수 있나. A·B 는 2차 + 정보성 컬럼, C·D 는 2차 컬럼이 있어야 한다. */
export function stratumAvailable(s: Stratum, a: Availability): boolean {
  if (a.second !== true) return false
  return s === 'C' || s === 'D' ? true : a.informative === true
}

// rr-v2 판정 조건은 자동승인과 같은 한 벌(lib/analysis/auto-approval.ts meetsRrV2)을 쓴다 — 갈라지면 A 층이 실제 승인과 어긋난다.
export const isRrV2 = (r: FeedbackRow): boolean => meetsRrV2(r)

/** 행 하나의 층. 어느 층도 아니거나(판정 하나뿐·둘 다 unknown) 그 층을 못 가르면 null. */
export function stratumOf(r: FeedbackRow, a: Availability): Stratum | null {
  if (a.second !== true) return null
  const v1 = r.verdict ?? null
  const v2 = r.second_verdict ?? null
  if (v1 === null || v2 === null) return null
  if (v1 !== v2) return 'C'
  if (v1 === 'irrelevant') return 'D'
  if (v1 === 'relevant') return a.informative === true ? (isRrV2(r) ? 'A' : 'B') : null
  return null
}

/** FNV-1a 32bit — seed(KST 날짜)와 input_id 로 순서를 정한다. 같은 날 같은 모집단이면 같은 묶음. */
function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

const KST = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })
/** ISO → KST 'YYYY-MM-DD'. 못 읽으면 null. */
export function kstDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : KST.format(t)
}

export interface StratumPlan {
  available: boolean
  pool: number
  picked: number
}
export interface Batch {
  items: { row: FeedbackRow; stratum: Stratum }[]
  strata: Record<Stratum, StratumPlan>
  availability: Availability
}

/**
 * 오늘의 묶음. 모집단 = 층이 있는 행 중 사람이 아직 안 본 것 **+ 오늘(KST) 본 것**.
 * 오늘 본 것을 남기는 이유: 저장할 때마다 새 카드가 밀려 들어오면 "하루 한 묶음"이 끝나지 않는다 —
 * 채점한 카드는 그 자리에 남아 모델 판정을 공개한다.
 * 층별 할당을 먼저 채우고, 모자란 만큼은 남은 행 전체에서 같은 해시 순서로 채운다(빈 층 보충).
 */
export function pickBatch(
  rows: readonly FeedbackRow[],
  opts: { today: string; quota?: Readonly<Record<Stratum, number>>; size?: number; exclude?: ReadonlySet<string> },
): Batch {
  const quota = opts.quota ?? DEFAULT_QUOTA
  const size = opts.size ?? BATCH_SIZE
  const availability = columnAvailability(rows)
  const key = (r: FeedbackRow) => hash(`${opts.today}:${r.input_id}`)
  const order = (a: FeedbackRow, b: FeedbackRow) => key(a) - key(b) || a.input_id.localeCompare(b.input_id)

  const pools: Record<Stratum, FeedbackRow[]> = { A: [], B: [], C: [], D: [] }
  for (const r of rows) {
    if (opts.exclude?.has(r.input_id)) continue
    const seen = r.human_verdict != null
    if (seen && kstDate(r.human_graded_at) !== opts.today) continue
    const s = stratumOf(r, availability)
    if (s) pools[s].push(r)
  }
  for (const s of STRATA) pools[s].sort(order)

  const items: Batch['items'] = []
  const rest: { row: FeedbackRow; stratum: Stratum }[] = []
  for (const s of STRATA) {
    const n = Math.min(quota[s], pools[s].length)
    pools[s].slice(0, n).forEach((row) => items.push({ row, stratum: s }))
    pools[s].slice(n).forEach((row) => rest.push({ row, stratum: s }))
  }
  rest.sort((a, b) => order(a.row, b.row))
  items.push(...rest.slice(0, Math.max(0, size - items.length)))
  // 화면 순서도 해시 — 층이 줄지어 나오면 어느 층인지 짐작된다(끌림 방지).
  items.sort((a, b) => order(a.row, b.row))
  const final = items.slice(0, size)

  const strata = {} as Record<Stratum, StratumPlan>
  for (const s of STRATA) {
    strata[s] = { available: stratumAvailable(s, availability), pool: pools[s].length, picked: final.filter((i) => i.stratum === s).length }
  }
  return { items: final, strata, availability }
}

/** 층별로 모델이 기대하는 사람 판정. C 는 1차·2차가 갈렸으니 기대값이 없다(어느 쪽이 맞았나를 센다). */
export const EXPECTED: Readonly<Record<Stratum, Verdict | null>> = { A: 'relevant', B: 'relevant', C: null, D: 'irrelevant' }

export interface StratumStats {
  available: boolean
  /** 사람이 relevant/irrelevant 로 채점한 수(모름 제외). */
  graded: number
  humanUnknown: number
  /** A·B·D: 사람이 기대값과 같았던 수. C: null. */
  agree: number | null
  rate: number | null
  /** C 전용 — 사람이 1차 편 / 2차 편. */
  firstRight: number
  secondRight: number
  /** 사람이 정보있음/없음을 고른 수와 그중 '있음'. A 는 있음이 기대, B 는 있음이면 기준이 너무 빡빡하다는 신호. */
  informativeGraded: number
  informativeTrue: number
}

const isScored = (v: string | null | undefined): v is 'relevant' | 'irrelevant' => v === 'relevant' || v === 'irrelevant'

/** 층별 사람 일치율. rows 는 human_verdict 가 있는 행(없는 행은 무시된다). */
export function stratumStats(rows: readonly FeedbackRow[], a: Availability = columnAvailability(rows)): Record<Stratum, StratumStats> {
  const out = {} as Record<Stratum, StratumStats>
  for (const s of STRATA) {
    out[s] = { available: stratumAvailable(s, a), graded: 0, humanUnknown: 0, agree: EXPECTED[s] ? 0 : null, rate: null, firstRight: 0, secondRight: 0, informativeGraded: 0, informativeTrue: 0 }
  }
  for (const r of rows) {
    if (r.human_verdict == null) continue
    const s = stratumOf(r, a)
    if (!s) continue
    const st = out[s]
    if (typeof r.human_product_informative === 'boolean') {
      st.informativeGraded++
      if (r.human_product_informative) st.informativeTrue++
    }
    if (!isScored(r.human_verdict)) { st.humanUnknown++; continue }
    st.graded++
    if (st.agree !== null && r.human_verdict === EXPECTED[s]) st.agree++
    if (r.human_verdict === r.verdict) st.firstRight++
    if (r.human_verdict === r.second_verdict) st.secondRight++
  }
  for (const s of STRATA) {
    const st = out[s]
    st.rate = st.agree !== null && st.graded > 0 ? st.agree / st.graded : null
  }
  return out
}

/** 사람이 층의 기대와 다르게 본 행(C 는 채점된 전부). 최근 채점 먼저. */
export function disagreements(rows: readonly FeedbackRow[], a: Availability = columnAvailability(rows)): { row: FeedbackRow; stratum: Stratum }[] {
  const out: { row: FeedbackRow; stratum: Stratum }[] = []
  for (const r of rows) {
    if (!isScored(r.human_verdict)) continue
    const s = stratumOf(r, a)
    if (!s) continue
    const exp = EXPECTED[s]
    if (exp === null || r.human_verdict !== exp) out.push({ row: r, stratum: s })
  }
  return out.sort((x, y) => String(y.row.human_graded_at ?? '').localeCompare(String(x.row.human_graded_at ?? '')))
}

/** 최근 days 일(KST, today 포함) 날짜별 층별 {채점, 일치}. 채점 0 인 날도 칸을 만든다 — "안 봤다"가 보이게. */
export function dailyTrend(rows: readonly FeedbackRow[], opts: { today: string; days: number }, a: Availability = columnAvailability(rows)) {
  const base = Date.parse(`${opts.today}T00:00:00Z`)
  const dates = Array.from({ length: opts.days }, (_, i) => new Date(base - i * 86_400_000).toISOString().slice(0, 10))
  const byDate = new Map(dates.map((d) => [d, Object.fromEntries(STRATA.map((s) => [s, { graded: 0, agree: 0 }])) as Record<Stratum, { graded: number; agree: number }>]))
  for (const r of rows) {
    if (!isScored(r.human_verdict)) continue
    const cell = byDate.get(kstDate(r.human_graded_at) ?? '')
    const s = stratumOf(r, a)
    if (!cell || !s) continue
    cell[s].graded++
    if (r.human_verdict === (EXPECTED[s] ?? r.verdict)) cell[s].agree++
  }
  return dates.map((date) => ({ date, strata: byDate.get(date)! }))
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface RelevanceSubmission {
  inputId: string
  verdict: Verdict
  informative: boolean | null
  note: string | null
}

/** 채점 폼 검증. 판정은 필수(빈칸 = 안 봄이지 무관이 아니다), 정보성·메모는 선택. */
export function readRelevanceSubmission(input: { inputId: unknown; verdict: unknown; informative: unknown; note: unknown }): { value: RelevanceSubmission | null; error?: string } {
  const inputId = typeof input.inputId === 'string' ? input.inputId.trim() : ''
  if (!UUID.test(inputId)) return { value: null, error: '대상 리뷰 식별자가 올바르지 않습니다. 새로고침 후 다시 시도하세요.' }
  const verdict = typeof input.verdict === 'string' ? input.verdict : ''
  if (!(VERDICTS as readonly string[]).includes(verdict)) return { value: null, error: '관련 / 무관 / 모름 중 하나를 고르세요.' }
  const inf = input.informative == null ? '' : String(input.informative)
  if (!['', 'true', 'false'].includes(inf)) return { value: null, error: '정보있음/정보없음 값이 올바르지 않습니다.' }
  const note = typeof input.note === 'string' ? input.note.trim() : ''
  if (note.length > NOTE_MAX) return { value: null, error: `메모는 ${NOTE_MAX}자 이하로 적어 주세요(현재 ${note.length}자).` }
  return { value: { inputId, verdict: verdict as Verdict, informative: inf === '' ? null : inf === 'true', note: note || null } }
}
