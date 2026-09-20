// /analyze 목록의 "정체" 신호 — 순수 계산. DB·네트워크·React 없음.
//   검사: scripts/analyze-list-signals-selftest.mjs
//
// 왜 따로 빼나: 목록 화면은 24행을 한 번에 그리는데, 어느 프로젝트가 몇 주째 검수 대기로
// 멈춰 있는지는 아무 데도 안 나왔다. 사람이 날짜를 눈으로 빼서 세야 했고, 그래서 아무도 안 셌다.
//
// ⚠️ 체류 시간의 기준 시각은 상태마다 다르다. 하나로 뭉치면(예: 전부 created_at) 어제 만든
//    프로젝트가 방금 분석을 끝냈는데도 "오래 멈춤" 으로 찍힌다. 그래서 **어느 시각을 썼는지**를
//    같이 돌려주고 화면이 그걸 말한다 — 숫자만 보여 주면 사람이 근거를 확인할 수 없다.

export type SignalRow = {
  status: string
  created_at?: string | null
  extract_started_at?: string | null
  extract_finished_at?: string | null
}

/** 정체 판정 기준일. 야간 수집이 매일 도니 일주일이면 사람 손이 빠진 것이다. */
export const STALL_DAYS = 7

/** 정체를 볼 상태 — 이 둘만 "사람이 다음 행동을 해야 하는데 안 한" 상태다. */
export const STALL_STATUSES: readonly string[] = ['extracted', 'processing']

export type DwellField = 'extract_finished_at' | 'extract_started_at' | 'created_at'

export const DWELL_FIELD_LABEL: Record<DwellField, string> = {
  extract_finished_at: '분석 완료 시각',
  extract_started_at:  '분석 시작 시각',
  created_at:          '생성 시각',
}

const ms = (v: string | null | undefined): number | null => {
  if (!v) return null
  const t = Date.parse(v)
  return Number.isFinite(t) ? t : null
}

/**
 * 이 행이 지금 상태로 들어온 시각. 없으면 `{ at: null, field: null }` — 0일이 아니다.
 *   extracted  → 분석이 끝난 시각부터 검수를 기다린다
 *   processing → 분석을 시작한 시각부터 돌고 있다
 *   그 밖      → 생성 시각
 */
export function dwellSince(row: SignalRow): { at: number | null; field: DwellField | null } {
  const order: DwellField[] = row.status === 'extracted'
    ? ['extract_finished_at', 'extract_started_at', 'created_at']
    : row.status === 'processing'
      ? ['extract_started_at', 'created_at']
      : ['created_at']
  for (const field of order) {
    const at = ms(row[field])
    if (at != null) return { at, field }
  }
  return { at: null, field: null }
}

export type Stall = { days: number | null; field: DwellField | null; stalled: boolean }

/** 체류 일수. 시각을 못 읽으면 `days: null`(확인 불가) — 0 으로 접지 않는다(§7.1). */
export function stallOf(row: SignalRow, now: number, thresholdDays = STALL_DAYS): Stall {
  const { at, field } = dwellSince(row)
  if (at == null) return { days: null, field: null, stalled: false }
  const days = Math.floor((now - at) / 86_400_000)
  const stalled = STALL_STATUSES.includes(row.status) && days >= thresholdDays
  return { days, field, stalled }
}

export type FunnelEntry = {
  status: string
  count: number
  /** 그 상태에서 가장 오래 멈춘 행의 체류 일수. 전부 확인 불가면 null. */
  longestDays: number | null
  longestField: DwellField | null
  /** 시각을 못 읽어 체류를 못 낸 행 수. 0 건과 "못 읽음" 을 가른다. */
  unknown: number
}

/** 상태별 건수 + 최장 체류. 순서는 입력 순서(먼저 나온 상태가 앞) — 화면이 다시 정렬하지 않는다. */
export function funnelStats(rows: readonly SignalRow[], now: number): FunnelEntry[] {
  const out: FunnelEntry[] = []
  const index = new Map<string, FunnelEntry>()
  for (const row of rows) {
    let e = index.get(row.status)
    if (!e) {
      e = { status: row.status, count: 0, longestDays: null, longestField: null, unknown: 0 }
      index.set(row.status, e)
      out.push(e)
    }
    e.count += 1
    const { days, field } = stallOf(row, now)
    if (days == null) { e.unknown += 1; continue }
    if (e.longestDays == null || days > e.longestDays) { e.longestDays = days; e.longestField = field }
  }
  return out
}
