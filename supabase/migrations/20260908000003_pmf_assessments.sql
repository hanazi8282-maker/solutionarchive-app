-- ============================================================
-- 20260908000003_pmf_assessments
--
-- PMF 진단 결과 적립 2테이블 (CTO 엔진 (b)).
--   pmf_assessments ──1:N── pmf_assessment_moves
--
-- ⚠️ 미적용. 사람이 적용한다:
--     supabase db query --linked -f supabase/migrations/20260908000003_pmf_assessments.sql
--   선행: 20260906000001(case_studies/case_moves), 20260816000001(analysis_projects).
--
-- 이 테이블이 답하는 질문
--   "이 아이템, 지금 들어가도 되나?" 를 **두 축**으로 답한다.
--     수요축(demand_axis)    = 우리 리뷰 데이터에 실제 불만이 있는가
--     선례축(precedent_axis) = 같은 병목을 남이 푼 적이 있는가
--   계산은 lib/cases/match.ts 의 demandAxis/precedentAxis/quadrantOf 를 그대로 쓴다.
--   여기서 산식을 다시 만들지 마라 — 두 벌이 되는 순간 화면과 스크립트가 갈라진다.
--
-- ★ 단일 점수 컬럼(`pmf_score`)을 만들지 않았다.
--   두 축을 한 숫자로 접으면 "선례가 없어서 낮음"과 "수요가 없어서 낮음"이 같은
--   값이 된다. 그 둘은 다음 행동이 정반대다(직접 검증 vs 손대지 않음).
--   lib/cases/match.ts 상단 주석의 판단을 스키마로 이어받는다.
--
-- ★ quadrant 는 NOT NULL 이 아니다.
--   한 축이라도 확인 불가면 사분면을 내지 않는다. NULL 을 "PARK(둘 다 약함)"
--   으로 채우면 "안 찾아봤다"가 "확인해보니 별로다"로 둔갑한다 (§7.1).
--   match_status='not_run' 이면 두 축과 quadrant 가 전부 NULL 이어야 한다 —
--   아래 CHECK 로 못박는다.
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1) pmf_assessments — 진단 1회
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pmf_assessments (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 사람이 넣은 5입력 원본(아이템/시장/가설병목/가격대/구매자). 원본을 통째로
  -- 남긴다 — 나중에 산식을 고쳤을 때 같은 입력으로 재계산할 수 있어야 한다.
  input             jsonb NOT NULL,

  -- input 을 case_studies 어휘(business_model/buyer_type/price_band/bottleneck)로
  -- 정규화한 결과. 매칭에 실제로 쓰인 값이다. input 과 다를 수 있고, 그 차이가
  -- "왜 이런 선례가 나왔나"의 답이다.
  facets            jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- 수요축 근거가 된 분석 프로젝트. 없으면 수요축은 확인 불가로 남는다.
  target_project_id uuid REFERENCES public.analysis_projects(id) ON DELETE SET NULL,

  demand_axis       numeric CHECK (demand_axis IS NULL OR (demand_axis >= 0 AND demand_axis <= 1)),
  precedent_axis    numeric CHECK (precedent_axis IS NULL OR (precedent_axis >= 0 AND precedent_axis <= 1)),

  quadrant          text CHECK (quadrant IS NULL OR quadrant IN (
                      'PROVEN_DEMAND', 'UNCHARTED_DEMAND', 'CROWDED_NO_DEMAND', 'PARK')),

  -- lib/cases/match.ts MATCH_STATUS 와 같은 3상태.
  match_status      text NOT NULL CHECK (match_status IN ('matched', 'no_match', 'not_run')),

  -- 왜 그 판정인지 한 줄. matchMoves().reason 을 그대로 넣는다.
  match_reason      text,

  created_by        text,
  created_at        timestamptz NOT NULL DEFAULT now(),

  -- ★ 확인 불가 실행이 숫자를 남기지 못하게 한다. 이 제약이 없으면 not_run 인데
  --   축이 0 으로 채워진 행이 생기고, 화면에서 "수요 0"으로 읽힌다.
  CONSTRAINT pmf_assessments_not_run_is_empty
    CHECK (match_status <> 'not_run'
           OR (demand_axis IS NULL AND precedent_axis IS NULL AND quadrant IS NULL)),

  -- 사분면은 두 축이 다 있을 때만 나온다 (quadrantOf 와 같은 규칙).
  CONSTRAINT pmf_assessments_quadrant_needs_axes
    CHECK (quadrant IS NULL OR (demand_axis IS NOT NULL AND precedent_axis IS NOT NULL))
);

COMMENT ON TABLE public.pmf_assessments IS
  'PMF 2축 진단 1회. 단일 점수를 만들지 않는다 — 두 축은 틀리는 방식이 다르다.';
COMMENT ON COLUMN public.pmf_assessments.quadrant IS
  'NULL 허용. 한 축이라도 확인 불가면 사분면을 내지 않는다 (§7.1).';
COMMENT ON COLUMN public.pmf_assessments.match_status IS
  'lib/cases/match.ts 와 같은 3상태. not_run 이면 축·사분면이 전부 NULL 이어야 한다.';
COMMENT ON COLUMN public.pmf_assessments.input IS
  '사람이 넣은 원본 5입력. 산식을 고친 뒤 재계산하려면 이게 있어야 한다.';

CREATE INDEX IF NOT EXISTS pmf_assessments_created_idx
  ON public.pmf_assessments (created_at DESC);
CREATE INDEX IF NOT EXISTS pmf_assessments_project_idx
  ON public.pmf_assessments (target_project_id);


-- ────────────────────────────────────────────────────────────
-- 2) pmf_assessment_moves — 그 진단이 딛고 선 선례 무브
-- ────────────────────────────────────────────────────────────
--
-- 왜 따로 남기는가: 선례축 숫자만 남기면 "0.8" 의 근거가 사라진다. 무브가
-- 나중에 강등(regrade)되거나 승인이 취소되면 이 진단도 스테일해지는데,
-- 연결이 없으면 그걸 감지할 방법이 없다 (L-63 과 같은 종류의 사고).
CREATE TABLE IF NOT EXISTS public.pmf_assessment_moves (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id  uuid NOT NULL REFERENCES public.pmf_assessments(id) ON DELETE CASCADE,
  case_move_id   uuid NOT NULL REFERENCES public.case_moves(id) ON DELETE CASCADE,

  -- matchMoves() 가 낸 점수. 같은 진단 안의 순위 근거다.
  match_score    numeric,
  match_reason   text,

  -- 무엇이 이 무브를 붙였나. 지금은 facet 뿐이다 — embedding/llm 은 아직
  -- 구현이 없다. 어휘를 미리 열어 두되, 값이 들어오는 건 구현된 뒤다.
  matched_by     text NOT NULL DEFAULT 'facet'
                   CHECK (matched_by IN ('facet', 'embedding', 'llm')),

  created_at     timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pmf_assessment_moves_unique UNIQUE (assessment_id, case_move_id)
);

COMMENT ON TABLE public.pmf_assessment_moves IS
  '진단이 인용한 선례 무브. 무브가 강등되면 이 진단이 스테일함을 감지하는 유일한 경로다.';
COMMENT ON COLUMN public.pmf_assessment_moves.matched_by IS
  '지금은 facet 만 구현돼 있다. embedding/llm 은 어휘만 열어 둔 상태다.';

CREATE INDEX IF NOT EXISTS pmf_assessment_moves_assessment_idx
  ON public.pmf_assessment_moves (assessment_id);
CREATE INDEX IF NOT EXISTS pmf_assessment_moves_move_idx
  ON public.pmf_assessment_moves (case_move_id);

COMMIT;


-- ============================================================
-- 검증 쿼리 (적용 직후)
-- ============================================================
--
-- ── 양성 1) 2테이블
-- SELECT table_name FROM information_schema.tables
--  WHERE table_schema='public' AND table_name IN ('pmf_assessments','pmf_assessment_moves');
--   기대: 2행
--
-- ── 양성 2) 확인 불가 진단은 축이 비어 있어야 정상 저장된다
-- INSERT INTO public.pmf_assessments (input, match_status, created_by)
--   VALUES ('{"probe":true}'::jsonb, 'not_run', '__probe__');
--   기대: 성공. demand_axis/precedent_axis/quadrant 전부 NULL
--
-- ── 양성 3) 정상 판정
-- INSERT INTO public.pmf_assessments (input, match_status, demand_axis, precedent_axis, quadrant, created_by)
--   VALUES ('{"probe":true}'::jsonb, 'matched', 0.7, 0.8, 'PROVEN_DEMAND', '__probe__');
--   기대: 성공
--
-- ── 음성 1) not_run 인데 축이 채워지면 거절돼야 한다  ★ 핵심 제약
-- INSERT INTO public.pmf_assessments (input, match_status, demand_axis, created_by)
--   VALUES ('{}'::jsonb, 'not_run', 0, '__probe__');
--   기대: ERROR 23514 pmf_assessments_not_run_is_empty
--
-- ── 음성 2) 한 축만 있는데 사분면을 내면 거절돼야 한다
-- INSERT INTO public.pmf_assessments (input, match_status, demand_axis, quadrant, created_by)
--   VALUES ('{}'::jsonb, 'matched', 0.7, 'PARK', '__probe__');
--   기대: ERROR 23514 pmf_assessments_quadrant_needs_axes
--
-- ── 음성 3) 0~1 밖의 축은 거절돼야 한다
-- INSERT INTO public.pmf_assessments (input, match_status, demand_axis, created_by)
--   VALUES ('{}'::jsonb, 'matched', 1.7, '__probe__');
--   기대: ERROR 23514 pmf_assessments_demand_axis_check
--
-- ── 음성 4) 어휘 밖 matched_by
-- INSERT INTO public.pmf_assessment_moves (assessment_id, case_move_id, matched_by)
--   SELECT a.id, m.id, 'vibes' FROM public.pmf_assessments a, public.case_moves m
--    WHERE a.created_by='__probe__' LIMIT 1;
--   기대: ERROR 23514 pmf_assessment_moves_matched_by_check
--
-- ── 정리
-- DELETE FROM public.pmf_assessments WHERE created_by='__probe__';


-- ============================================================
-- 거부한 대안
-- ============================================================
--
-- (A) 단일 pmf_score numeric 컬럼
--     두 축을 접으면 다음 행동이 정반대인 두 상태가 같은 값이 된다.
--     lib/cases/match.ts §"축을 왜 둘로 나누는가" 와 같은 판단이다.
--
-- (B) quadrant NOT NULL DEFAULT 'PARK'
--     확인 불가를 "둘 다 약함"으로 접는다. 이 리포가 반복해 잡은 사고다.
--
-- (C) demand_axis/precedent_axis 를 GENERATED 컬럼으로
--     선례축은 **다른 행들(case_moves)** 을 봐야 나온다. GENERATED 는 같은 행만
--     참조할 수 있다. case_moves.evidence_grade 를 GENERATED 로 못 만든 것과 같은 이유.
--
-- (D) pmf_assessment_moves 없이 moves jsonb 배열
--     무브가 강등·미승인으로 바뀌었을 때 이 진단이 스테일해진 걸 조인으로
--     못 잡는다. 스테일 감지가 이 테이블의 존재 이유다.
--
-- (E) target_project_id NOT NULL
--     수요축 없이 선례축만 내는 진단이 정상 경로다(리뷰 데이터가 없는 신규 시장).
--     그때는 사분면을 안 그리고 선례축만 보고한다.
