// v71cu S14 회사 추천표 — 후보 기준·"근거 얇음" 계산·결론서 건너뛰기 판정(순수 함수, DB 없음).
// 기존 기준은 상수로 보존하고, 새 기준(남헌 결정 2026-11-19)이 기본이다. 값은 env 로 조정한다.

/** 원래 S14 기준(cc-instruction-2026-11-19-v71cu-collection-v2.md §S14): 한국어 스토어 리뷰 100건+ · 한국어 1~2점 30건+. 보존용. */
export const LEGACY_CRITERIA = { koMin: 100, koLowMin: 30 } as const
/** 새 기준(남헌 결정): 전체 1~2점 150건+ · 한국어 50건+. 기본 동작. */
export const NEW_CRITERIA = { lowTotalMin: 150, koMin: 50 } as const
/** 근거 얇음 규칙 값 — 한국어 1~2점이 이보다 적거나, 1~2점 중 한쪽 점수가 이 비율을 넘으면 얇다. */
export const THIN_RULE = { koLowMin: 10, skewShare: 0.9, skewMinN: 20 } as const

const num = (v: string | undefined, d: number) => { const n = Number(v); return v !== undefined && v !== '' && Number.isFinite(n) ? n : d }
export const criteria = (env: Record<string, string | undefined> = process.env) => ({
  lowTotalMin: num(env.COMPANY_MIN_LOW_TOTAL, NEW_CRITERIA.lowTotalMin),
  koMin: num(env.COMPANY_MIN_KO, NEW_CRITERIA.koMin),
})

export type CompanyStats = { total: number; ko: number; low_total: number; ko_low: number; low1: number; low2: number }

export const passesLegacy = (s: CompanyStats) => s.ko >= LEGACY_CRITERIA.koMin && s.ko_low >= LEGACY_CRITERIA.koLowMin
export const passesCriteria = (s: CompanyStats, c = criteria()) => s.low_total >= c.lowTotalMin && s.ko >= c.koMin

/** 근거 얇음: 이유 목록(빈 배열이면 충분). 기준 통과 행에만 의미가 있다. */
export function thinReasons(s: CompanyStats): string[] {
  const r: string[] = []
  if (s.ko_low < THIN_RULE.koLowMin) r.push(`ko_low<${THIN_RULE.koLowMin}`)
  const low = s.low1 + s.low2
  if (low >= THIN_RULE.skewMinN && Math.max(s.low1, s.low2) / low > THIN_RULE.skewShare) r.push(`score_skew>${THIN_RULE.skewShare * 100}%`)
  return r
}

/** 기준을 못 넘으면 null(행 만들지 않음 — 근거 없는 행 금지). 넘으면 표 행 속성. */
export function toRow(s: CompanyStats, c = criteria()) {
  if (!passesCriteria(s, c)) return null
  const reasons = thinReasons(s)
  return { thin_evidence: reasons.length > 0, thin_reasons: reasons, passes_legacy: passesLegacy(s) }
}

/** 결론서 생성기용: 깃발 ON 이고 표에서 thin_evidence=true 면 건너뛴다. 깃발 OFF·표에 없음·값 null 이면 기존 경로 그대로. */
export const skipThinEnabled = (env: Record<string, string | undefined> = process.env) => env.COMPANY_THIN_SKIP_ENABLED === 'true'
export const shouldSkipThin = (row: { thin_evidence?: boolean | null } | null | undefined, enabled = skipThinEnabled()) => enabled && row?.thin_evidence === true
