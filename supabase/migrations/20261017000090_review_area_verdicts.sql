-- ============================================================
-- 20261017000090_review_area_verdicts
--
-- HN 1차 relevant 글 단위 영역 재판정(남헌 v71aj §5-3, D-37/45)의 결과 표 + 실효 영역 뷰. 설계: reports/2026-10-17/mention-loop-v71aj.md §6.
--
--   review_area_verdicts   글(analysis_inputs) 하나에 대한 영역 ①~⑤/none 판정. insert-only — UPDATE 는 트리거가 막는다.
--                          같은 글·같은 프롬프트 버전은 한 행(UNIQUE) — 다시 돌린 결과는 ON CONFLICT DO NOTHING 으로 버려진다.
--                          프롬프트를 바꾸면 버전을 올려 새 행으로 쌓는다(옛 행을 고치지 않는다).
--   v_input_area_effective v_input_area 에 글 단위 영역을 얹은 읽기 뷰. 우선순위(lib/analysis/area-reclass.ts effectiveArea 와 한 벌):
--                          1) 프로젝트 영역 ①~⑤·design → 그대로  2) 그 밖(out-*·NULL, hold 제외) → 그 글의 최신 판정이 ①~⑤ ∧ fit ≥ 0.7 이면 그 영역
--                          3) 그 밖 → 프로젝트 영역 그대로.
--
-- 덮지 않는 것: review_relevance_verdicts · analysis_projects.area_code · v_input_area(기존 뷰는 그대로 — 이 뷰는 새 이름).
--   기존 소비자(T2 순서·대시보드·언급 루프 읽기 SQL)는 이 뷰로 옮기기 전까지 영향 0.
--
-- 🟢 비파괴. 새 표·새 뷰·새 트리거 함수만. 백필 없음(행은 scripts/hn-area-reclass.mjs sql 이 만든 INSERT 를 정밀도 게이트 통과 뒤에만 넣는다).
--    §10.2 사람 판단 예외 1~8 해당 없음(삭제·기존 행 변경·키·법적·돈 없음 — 재판정 모델 호출 비용은 기존 일일 예산 안).
-- ⚠️ 미적용 — CTO 서브에이전트가 만든 파일. 적용은 CEO-staff/역할 세션. 적용 전: solutionarchive `qmgrfqjfxqhxuufrnkwf` 확인 →
--    information_schema 로 표·뷰 부재 확인. 롤백: 20261017000090_review_area_verdicts_rollback.sql.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.review_area_verdicts (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  input_id       uuid NOT NULL REFERENCES public.analysis_inputs(id) ON DELETE CASCADE,
  area_code      text NOT NULL CHECK (area_code IN ('1', '2', '3', '4', '5', 'none')),
  fit            numeric(4,3) NOT NULL CHECK (fit >= 0 AND fit <= 1),
  model          text NOT NULL,
  prompt_version text NOT NULL,
  judged_at      timestamptz NOT NULL DEFAULT now(),
  -- 판정 근거 짧은 태그(모델 출력, 12단어 이내). 원문 인용이 아니다.
  label          text CHECK (label IS NULL OR length(label) <= 120),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT review_area_verdicts_input_version_key UNIQUE (input_id, prompt_version)
);

CREATE INDEX IF NOT EXISTS review_area_verdicts_input_idx
  ON public.review_area_verdicts (input_id, judged_at DESC);

ALTER TABLE public.review_area_verdicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_area_verdicts FORCE  ROW LEVEL SECURITY;
REVOKE ALL ON public.review_area_verdicts FROM anon, authenticated;

-- insert-only: UPDATE 를 막는다. DELETE 는 막지 않는다(analysis_inputs CASCADE·롤백 경로).
CREATE OR REPLACE FUNCTION public.review_area_verdicts_no_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'review_area_verdicts 는 insert-only 다 — 새 prompt_version 으로 새 행을 넣는다' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS review_area_verdicts_no_update ON public.review_area_verdicts;
CREATE TRIGGER review_area_verdicts_no_update
  BEFORE UPDATE ON public.review_area_verdicts
  FOR EACH ROW EXECUTE FUNCTION public.review_area_verdicts_no_update();

COMMENT ON TABLE public.review_area_verdicts IS
  '글 단위 영역 재판정(insert-only, v71aj §5-3). 기존 판정·프로젝트 영역을 덮지 않는다. 실효 영역은 v_input_area_effective. 정책 0개 = service_role 전용.';
COMMENT ON COLUMN public.review_area_verdicts.fit IS '영역 확신 0~1. 실효 영역에 쓰는 하한 0.7(v_input_area_effective · area-reclass.ts FIT_MIN).';

CREATE OR REPLACE VIEW public.v_input_area_effective WITH (security_invoker = true) AS
WITH latest AS (
  SELECT DISTINCT ON (input_id) input_id, area_code, fit, prompt_version, judged_at
    FROM public.review_area_verdicts
   ORDER BY input_id, judged_at DESC, id DESC
)
SELECT a.input_id,
       a.project_id,
       a.source_key,
       a.area_code AS project_area_code,
       CASE
         WHEN a.area_code IN ('1', '2', '3', '4', '5', 'design') THEN a.area_code
         WHEN coalesce(a.area_code, '') <> 'hold' AND l.area_code <> 'none' AND l.fit >= 0.7 THEN l.area_code
         ELSE a.area_code
       END AS area_code,
       CASE
         WHEN a.area_code IN ('1', '2', '3', '4', '5', 'design') THEN 'project'
         WHEN coalesce(a.area_code, '') <> 'hold' AND l.area_code <> 'none' AND l.fit >= 0.7 THEN 'input'
         ELSE 'project'
       END AS area_via,
       l.area_code AS input_area_code,
       l.fit AS input_fit,
       l.prompt_version AS input_prompt_version,
       a.purged_at
  FROM public.v_input_area a
  LEFT JOIN latest l ON l.input_id = a.input_id;

COMMENT ON VIEW public.v_input_area_effective IS
  '글 단위 실효 영역(읽기 전용). 프로젝트 영역 ①~⑤·design 우선 → 아니면(hold 제외) 글 재판정 ①~⑤ ∧ fit≥0.7 → 아니면 프로젝트 영역. area_via = project|input.';
REVOKE ALL ON public.v_input_area_effective FROM anon, authenticated;

COMMIT;

-- 적용 후 확인
--   양성: SELECT to_regclass('public.review_area_verdicts'), to_regclass('public.v_input_area_effective');  -- 둘 다 NOT NULL
--         SELECT count(*) FROM public.v_input_area_effective;  =  SELECT count(*) FROM public.v_input_area;  -- 같은 행 수(JOIN 이 늘리지 않음)
--         SELECT count(*) FROM public.v_input_area_effective WHERE area_via = 'input';  -- 기대 0(아직 행 없음)
--   음성(롤백되는 형태 — 데이터 안 남음):
--     BEGIN;
--       INSERT INTO public.review_area_verdicts (input_id, area_code, fit, model, prompt_version)
--         SELECT id, '1', 0.9, 'selftest', 'arv-test' FROM public.analysis_inputs LIMIT 1;
--       UPDATE public.review_area_verdicts SET fit = 0.1 WHERE prompt_version = 'arv-test';  -- 기대: 42501 insert-only
--     ROLLBACK;
--     BEGIN;
--       INSERT INTO public.review_area_verdicts (input_id, area_code, fit, model, prompt_version)
--         SELECT id, '6', 0.9, 'selftest', 'arv-test' FROM public.analysis_inputs LIMIT 1;  -- 기대: 23514 area_code CHECK
--     ROLLBACK;
