// v71cu S14 회사 추천표 — 후보 기준·"근거 얇음" 계산·결론서 건너뛰기 판정(순수 함수, DB 없음).
// 기존 기준은 상수로 보존하고, 새 기준(남헌 결정 2026-11-19)이 기본이다. 값은 env 로 조정한다.

/** 원래 S14 기준(cc-instruction-2026-11-19-v71cu-collection-v2.md §S14): 한국어 스토어 리뷰 100건+ · 한국어 1~2점 30건+. 보존용. */
export const LEGACY_CRITERIA = { koMin: 100, koLowMin: 30 } as const
/** 새 기준(남헌 결정): 전체 1~2점 150건+ · 한국어 50건+. 기본 mode='or'(둘 중 하나) — 실측 112개 중 AND 는 1곳(Hootsuite)뿐, OR 은 약 17곳(2026-11-20 오케스트레이터 집계).
 *  취지는 "기준을 낮추고 근거 얇은 곳은 표시해 건너뛴다"이므로 표는 OR 로 넓히고 얇은 곳은 thin_evidence 로 거른다. AND 는 env COMPANY_CRITERIA_MODE=and. */
export const NEW_CRITERIA = { lowTotalMin: 150, koMin: 50, mode: 'or' } as const
export type CriteriaMode = 'or' | 'and'
/** 근거 얇음 규칙 값(임계값은 여기 한 곳). 초안값 — 남헌 확정 전.
 *  koLowMin: 한국어 1~2점이 이보다 적고 전체 1~2점도 lowTotalMin 미만이면 얇다(어느 쪽으로도 불만 글이 모자람).
 *  koOnlyLowMax: 한국어 글이 koMin 이상인데 1~2점이 이보다 적으면 얇다(실측 Judge.me ko1626·low3, Loox ko1347·low1 — 글은 많아도 불만 근거 없음).
 *  skew*: 1~2점이 skewMinN 건 이상이고 한쪽 점수가 skewShare 초과면 얇다(점수 분포 쏠림). */
export const THIN_RULE = { koLowMin: 10, lowTotalMin: 150, koOnlyLowMax: 20, skewShare: 0.9, skewMinN: 20 } as const

const num = (v: string | undefined, d: number) => { const n = Number(v); return v !== undefined && v !== '' && Number.isFinite(n) ? n : d }
export const criteria = (env: Record<string, string | undefined> = process.env) => ({
  lowTotalMin: num(env.COMPANY_MIN_LOW_TOTAL, NEW_CRITERIA.lowTotalMin),
  koMin: num(env.COMPANY_MIN_KO, NEW_CRITERIA.koMin),
  mode: (env.COMPANY_CRITERIA_MODE === 'and' ? 'and' : NEW_CRITERIA.mode) as CriteriaMode,
})

export type CompanyStats = { total: number; ko: number; low_total: number; ko_low: number; low1: number; low2: number }

export const passesLegacy = (s: CompanyStats) => s.ko >= LEGACY_CRITERIA.koMin && s.ko_low >= LEGACY_CRITERIA.koLowMin
export const passesCriteria = (s: CompanyStats, c = criteria()) => {
  const a = s.low_total >= c.lowTotalMin, b = s.ko >= c.koMin
  return c.mode === 'and' ? a && b : a || b
}

/** 근거 얇음: 이유 목록(빈 배열이면 충분). 기준 통과 행에만 의미가 있다. */
export function thinReasons(s: CompanyStats): string[] {
  const r: string[] = []
  if (s.ko_low < THIN_RULE.koLowMin && s.low_total < THIN_RULE.lowTotalMin) r.push(`ko_low<${THIN_RULE.koLowMin}&low_total<${THIN_RULE.lowTotalMin}`)
  if (s.ko >= NEW_CRITERIA.koMin && s.low_total < THIN_RULE.koOnlyLowMax) r.push(`ko_only_low<${THIN_RULE.koOnlyLowMax}`)
  const low = s.low1 + s.low2
  if (low >= THIN_RULE.skewMinN && Math.max(s.low1, s.low2) / low > THIN_RULE.skewShare) r.push(`score_skew>${THIN_RULE.skewShare * 100}%`)
  return r
}

/** 이름 칸이 'candidate:xxx' 같은 발굴 코드면 회사명을 사람이 고쳐야 한다(name_needs_fix). 회사/앱군 구분에도 쓴다. */
export const nameNeedsFix = (name: string | null | undefined) => !name || /^candidate:/i.test(name)

/** 기준을 못 넘으면 null(행 만들지 않음 — 근거 없는 행 금지). 넘으면 표 행 속성. */
export function toRow(s: CompanyStats, c = criteria()) {
  if (!passesCriteria(s, c)) return null
  const reasons = thinReasons(s)
  return { thin_evidence: reasons.length > 0, thin_reasons: reasons, passes_legacy: passesLegacy(s) }
}

/** 결론서 생성기용: 깃발 ON 이고 표에서 thin_evidence=true 면 건너뛴다. 깃발 OFF·표에 없음·값 null 이면 기존 경로 그대로. */
export const skipThinEnabled = (env: Record<string, string | undefined> = process.env) => env.COMPANY_THIN_SKIP_ENABLED === 'true'
export const shouldSkipThin = (row: { thin_evidence?: boolean | null } | null | undefined, enabled = skipThinEnabled()) => enabled && row?.thin_evidence === true
