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
