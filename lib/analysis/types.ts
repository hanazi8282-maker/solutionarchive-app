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

// ── 분석 방향 (§13-1) ────────────────────────────────────────
// forward : 자사 상품의 소구점을 발굴한다 (기본).
// reverse : 경쟁사의 이미 성공한 상품 URL 을 역설계한다.
// DB CHECK 제약(analysis_projects.mode)과 값이 반드시 일치해야 한다.
export const ANALYSIS_MODES = ['forward', 'reverse'] as const
export type AnalysisMode = (typeof ANALYSIS_MODES)[number]

export const MODE_LABELS: Record<AnalysisMode, string> = {
  forward: '자사 상품 소구점 발굴',
  reverse: '경쟁사 성공 상품 역설계',
}

// 앵글 화면을 열 수 있는 프로젝트 상태(검수 완료 이후). 앵글 화면과 목록이 같이 쓴다.
export const ANGLE_READY_STATUSES: readonly string[] = ['reviewed', 'angled', 'done']

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

// AnalysisProject / AnalysisInput 행 타입은 여기 있었지만 참조 0건이었다(2026-09-19 감사 3-3).
// 각 화면·라우트가 자기 select 컬럼에 맞춘 Row 타입을 따로 두므로 여기서 지웠다.

export const ANGLE_TYPE_LABELS: Record<AngleType, string> = {
  PAS:            '문제-자극-해결',
  MECHANISM:      '고유 메커니즘',
  COMPARISON:     '직접 비교',
  SOCIAL_PROOF:   '사회적 증거',
  FEAR_FOMO:      '공포·FOMO',
  ASPIRATION:     '열망 변신',
  REATTRIBUTION:  '귀책 전가',
  SELF_SELECTION: '자기 선택',
}

export const OUTPUT_TYPE_LABELS: Record<OutputType, string> = {
  COPY:          '카피',
  STRUCTURE:     '구성안',
  OFFER:         '오퍼',
  PRODUCT_SPEC:  '제품 개선 메모',
  BASELINE_SPEC: '기본기 메모',
}

// 소비자에게 그대로 노출되는 산출물인지, 내부 검토용 메모인지.
// 화면에서 이 둘을 절대 헷갈리면 안 되므로 시각 처리의 분기 기준이 된다.
export const INTERNAL_OUTPUT_TYPES: OutputType[] = ['PRODUCT_SPEC', 'BASELINE_SPEC']

export function isInternalOutput(t: OutputType | null): boolean {
  return t !== null && INTERNAL_OUTPUT_TYPES.includes(t)
}

export const SUBSTANTIATION_VERDICT_LABELS: Record<SubstantiationVerdict, string> = {
  SUBSTANTIATED:   '근거 있음',
  EXPERIENTIAL:    '체험 기반',
  UNSUBSTANTIATED: '근거 없음 · 순화됨',
}

export const PERSONA_ROLE_LABELS: Record<PersonaRole, string> = {
  BUYER:      '구매자',
  USER:       '사용자',
  PAYER:      '결제자',
  INFLUENCER: '영향자',
}

// QUADRANT_LABELS 는 검수 화면용 설명문이라 길다. 배지에는 이 짧은 쪽을 쓴다.
export const QUADRANT_SHORT_LABELS: Record<Quadrant, string> = {
  TABLE_STAKES:   '기본기',
  DIFFERENTIATOR: '차별화 기회',
  OVER_INVESTED:  '과잉투자',
  IGNORE:         '무시',
}

// ── 시장 성숙도(Stage 2) 해설 — 숫자 옆에 "그래서 뭘 해라" (docs/pmf-product-design.md §3-1 3) ──
// 단계 정의는 추출 프롬프트(lib/analysis/extract-run.ts SYSTEM_PROMPT)와 같은 문장이어야 한다. 바꾸면 둘 다 바꾼다.
export interface MaturityStage {
  stage: 1 | 2 | 3 | 4 | 5
  name: string
  /** 리뷰가 어떤 이야기를 하고 있나. */
  meaning: string
  /** 이 단계의 셀러가 지금 할 일 1줄. 권고이지 보장이 아니다. */
  action: string
}

export const MATURITY_STAGES: readonly MaturityStage[] = [
  { stage: 1, name: '시장 창출', meaning: '직접 편익 위주. 주장이 서로 겹치지 않는다 — 카테고리 자체를 설명해야 팔린다.', action: '편익을 한 문장으로 못 박아라. 비교보다 "이게 뭔지" 가 먼저다.' },
  { stage: 2, name: '주장 확장', meaning: '여러 브랜드가 각자 다른 주장을 편다. 겹침은 아직 낮다.', action: '남이 안 하는 주장 하나를 잡아라. 리뷰에서 만족도가 낮은 속성이 그 자리다.' },
  { stage: 3, name: '고유 메커니즘 등장', meaning: '"왜 되는가" 를 설명하는 브랜드가 나온다. 메커니즘이 곧 차별화다.', action: '메커니즘을 증거와 함께 말해라. 주장만 있는 소구점은 이 단계부터 안 먹힌다.' },
  { stage: 4, name: '메커니즘 정제', meaning: '주장이 서로 겹친다. 스펙·수치 비교가 리뷰의 주 언어다.', action: '스펙 경쟁에 끼지 마라. 만족도가 낮은 속성(격차)만 골라 좁게 쳐라.' },
  { stage: 5, name: '정체성·재창출', meaning: '스펙 경쟁이 소진됐다. 부작용·유지보수·"요즘은 다 비슷하다" 이야기가 주를 이룬다.', action: '누구를 위한 제품인지(정체성)로 다시 시작해라. 성능 소구는 끝났다.' },
] as const

export function maturityStageOf(stage: number | null | undefined): MaturityStage | null {
  if (stage == null) return null
  return MATURITY_STAGES.find((m) => m.stage === stage) ?? null
}
