// 경쟁사 소구점 분석 파이프라인 공통 상수/타입
// DB CHECK 제약(20260816000001_analysis_pipeline.sql)과 값이 반드시 일치해야 한다.

export const ANALYSIS_PURPOSES = ['hook', 'ad_conversion', 'detail_page', 'product_fit'] as const
export type AnalysisPurpose = (typeof ANALYSIS_PURPOSES)[number]

export const PURPOSE_LABELS: Record<AnalysisPurpose, string> = {
  hook:         '광고 후킹 (멈추게 하는 말)',
  ad_conversion:'메타광고 전환 (사게 하는 말)',
  detail_page:  '상세페이지 구매전환 (확신 주는 말)',
  product_fit:  '제품/오퍼 매력 (애초에 팔릴 제품인가)',
}

export const ANALYSIS_SOURCE_TYPES = ['review', 'ad', 'detail_page'] as const
export type AnalysisSourceType = (typeof ANALYSIS_SOURCE_TYPES)[number]

export const SOURCE_TYPE_LABELS: Record<AnalysisSourceType, string> = {
  review:       '리뷰',
  ad:           '광고',
  detail_page:  '상세페이지',
}

// ── Stage1(VOC 마이닝) aspect 분류 축 ────────────────────────
// DB CHECK 제약(analysis_aspects)과 값이 반드시 일치해야 한다.
export const ASPECT_LAYERS = ['PRODUCT', 'PROCESS', 'OUTCOME'] as const
export type AspectLayer = (typeof ASPECT_LAYERS)[number]

export const ATTRIBUTIONS = ['PRODUCT_FAULT', 'USER_FAULT', 'ENVIRONMENT'] as const
export type Attribution = (typeof ATTRIBUTIONS)[number]

export const PAIN_TIMINGS = ['PRE_PURCHASE', 'POST_PURCHASE'] as const
export type PainTiming = (typeof PAIN_TIMINGS)[number]

export const PERSONA_ROLES = ['BUYER', 'USER', 'PAYER', 'INFLUENCER'] as const
export type PersonaRole = (typeof PERSONA_ROLES)[number]

export const VALUE_REALIZATION_FREQUENCIES = ['HIGH', 'MEDIUM', 'LOW'] as const
export type ValueRealizationFrequency = (typeof VALUE_REALIZATION_FREQUENCIES)[number]

// ── Stage3(사분면) ───────────────────────────────────────────
// 중요도/만족도의 중앙값을 기준으로 4분면 분류. 검수 완료 시점에 계산한다.
export const QUADRANTS = ['TABLE_STAKES', 'DIFFERENTIATOR', 'OVER_INVESTED', 'IGNORE'] as const
export type Quadrant = (typeof QUADRANTS)[number]

export const QUADRANT_LABELS: Record<Quadrant, string> = {
  TABLE_STAKES:   '기본기 (중요·충족 — 없으면 탈락, 있어도 차별화 안 됨)',
  DIFFERENTIATOR: '차별화 기회 (중요·미충족 — 소구점의 본진)',
  OVER_INVESTED:  '과잉투자 (덜 중요·충족 — 자원 회수 대상)',
  IGNORE:         '무시 (덜 중요·미충족 — 건드리지 않음)',
}

// ── Stage4(앵글 생성) ────────────────────────────────────────
export const ANGLE_TYPES = [
  'PAS', 'MECHANISM', 'COMPARISON', 'SOCIAL_PROOF',
  'FEAR_FOMO', 'ASPIRATION', 'REATTRIBUTION', 'SELF_SELECTION',
] as const
export type AngleType = (typeof ANGLE_TYPES)[number]

export const OUTPUT_TYPES = ['COPY', 'STRUCTURE', 'OFFER', 'PRODUCT_SPEC', 'BASELINE_SPEC'] as const
export type OutputType = (typeof OUTPUT_TYPES)[number]

export const SUBSTANTIATION_VERDICTS = ['SUBSTANTIATED', 'EXPERIENTIAL', 'UNSUBSTANTIATED'] as const
export type SubstantiationVerdict = (typeof SUBSTANTIATION_VERDICTS)[number]

export type AnalysisProject = {
  id: string
  competitor_url: string
  product_elevator_pitch: string
  purpose: AnalysisPurpose
  seller_own_guess: string | null
  status: string
  maturity_stage: number | null
  maturity_notes: string | null
  m_meta_signal: boolean | null
  created_at: string | null
}

export type AnalysisInput = {
  id: string
  project_id: string
  source_type: AnalysisSourceType
  raw_text: string
  created_at: string | null
}
