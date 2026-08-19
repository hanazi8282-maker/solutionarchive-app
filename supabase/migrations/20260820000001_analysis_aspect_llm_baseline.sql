-- ============================================================
-- 검수 교정 diff 수집: LLM 원본값 보존 컬럼 추가
--
-- 배경: 검수 화면에서 사람이 LLM 추출 결과를 고치면 원래 값이 덮여 사라진다.
--   그 "고치기 전 → 고친 후" 쌍이야말로 로직이 무엇을 틀리는지 말해주는
--   유일한 라벨 데이터인데, 지금은 매 검수마다 버려지고 있다.
--   llm_* 컬럼에 추출 시점의 원본을 그대로 남겨 diff 를 사후 계산할 수 있게 한다.
--
-- 채워지는 시점: Stage1 추출 INSERT (app/api/analyze/extract/route.ts).
--   추출 직후에는 llm_* 와 실제 컬럼이 같은 값이고, 이후 검수 PUT 은 실제 컬럼만
--   건드리므로 llm_* 는 원본으로 남는다. 검수 경로는 llm_* 를 payload 에 넣지 않는다.
--
-- 기존 데이터 영향: 전부 nullable ADD COLUMN. 기존 행은 신규 컬럼이 null 이 될 뿐
--   CHECK 위반도, NOT NULL 도, 인덱스 변경도 없다. 운영 중 무중단 적용 가능.
--   이 마이그레이션 이전에 추출된 행은 llm_* 가 null 이고, 이는 "교정 없음"이 아니라
--   "원본을 알 수 없음"이다. 분석 스크립트는 llm_* 가 null 인 행을 집계에서 제외한다.
--
-- ⚠️ 배포 순서: 이 마이그레이션을 **먼저** 적용한 뒤 코드를 배포한다.
--   순서가 뒤집히면 신규 컬럼을 포함한 INSERT 가 PostgREST 스키마 캐시에서
--   PGRST204(또는 42703 undefined_column)로 전부 실패한다.
--   (20260818000001 에서 같은 함정을 겪었다.)
--
-- 가역: 동명 rollback 파일 참조(20260820000001_..._rollback.sql).
-- ============================================================

-- ── 점수 원본 ────────────────────────────────────────────────
-- 원본 컬럼 importance/satisfaction 이 numeric 이고 검수 UI 가 0.5 단위를
-- 허용하므로 여기도 numeric 으로 맞춘다. int 로 두면 7.5 가 8 로 반올림돼
-- 저장되어, 이 기능의 목적인 "오차 크기 측정"이 원천적으로 왜곡된다.
-- 정수만 쓰기로 확정한다면 아래 두 줄의 numeric 을 int 로 바꾸면 된다.
ALTER TABLE public.analysis_aspects
  ADD COLUMN IF NOT EXISTS llm_importance numeric;

ALTER TABLE public.analysis_aspects
  ADD COLUMN IF NOT EXISTS llm_satisfaction numeric;

-- ── 분류 축 원본 ─────────────────────────────────────────────
-- CHECK 제약은 걸지 않는다. 이 컬럼들은 "LLM 이 실제로 뭐라고 했는가"의 기록이고,
-- 나중에 열거값이 바뀌어도 과거 기록이 제약 위반으로 막히면 안 되기 때문이다.
-- (쓰기 경로에서 pickEnum 이 이미 허용값으로 정규화한다.)
ALTER TABLE public.analysis_aspects
  ADD COLUMN IF NOT EXISTS llm_attribution text;

ALTER TABLE public.analysis_aspects
  ADD COLUMN IF NOT EXISTS llm_aspect_layer text;

ALTER TABLE public.analysis_aspects
  ADD COLUMN IF NOT EXISTS llm_pain_timing text;

ALTER TABLE public.analysis_aspects
  ADD COLUMN IF NOT EXISTS llm_persona_role text;

ALTER TABLE public.analysis_aspects
  ADD COLUMN IF NOT EXISTS llm_proxy_consumption boolean;

ALTER TABLE public.analysis_aspects
  ADD COLUMN IF NOT EXISTS llm_is_segmentation_axis boolean;

-- ── 검수 시각 ────────────────────────────────────────────────
-- 사람이 이 속성을 처음 '확인'으로 표시한 시각. 재저장해도 덮어쓰지 않는다.
ALTER TABLE public.analysis_aspects
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

-- ── 컬럼 의미 주석 ───────────────────────────────────────────
COMMENT ON COLUMN public.analysis_aspects.llm_importance IS
  'Stage1 추출 시점 LLM 이 매긴 중요도 원본. 사람이 importance 를 고쳐도 불변. null 이면 이 마이그레이션 이전 행.';
COMMENT ON COLUMN public.analysis_aspects.llm_satisfaction IS
  'Stage1 추출 시점 LLM 이 매긴 만족도 원본. 사람이 satisfaction 을 고쳐도 불변.';
COMMENT ON COLUMN public.analysis_aspects.llm_attribution IS
  'LLM 원본 귀인. 사람 교정본과 대조해 오분류 매트릭스를 만든다.';
COMMENT ON COLUMN public.analysis_aspects.llm_aspect_layer IS 'LLM 원본 레이어(PRODUCT/PROCESS/OUTCOME).';
COMMENT ON COLUMN public.analysis_aspects.llm_pain_timing IS 'LLM 원본 인지 시점(PRE_PURCHASE/POST_PURCHASE).';
COMMENT ON COLUMN public.analysis_aspects.llm_persona_role IS 'LLM 원본 페르소나 역할(BUYER/USER/PAYER/INFLUENCER).';
COMMENT ON COLUMN public.analysis_aspects.llm_proxy_consumption IS 'LLM 원본 대리소비 판정.';
COMMENT ON COLUMN public.analysis_aspects.llm_is_segmentation_axis IS 'LLM 원본 세그먼트 축 판정.';
COMMENT ON COLUMN public.analysis_aspects.reviewed_at IS
  '사람이 이 속성을 처음 human_confirmed=true 로 표시한 시각. 이미 값이 있으면 갱신하지 않는다.';
