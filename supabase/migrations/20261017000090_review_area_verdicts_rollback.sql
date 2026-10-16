-- 롤백: 20261017000090_review_area_verdicts
-- ⚠️ 파괴적 — review_area_verdicts 행이 있으면 함께 사라진다. 먼저 남긴다:
--   COPY (SELECT * FROM public.review_area_verdicts) TO STDOUT WITH CSV HEADER;   -- 또는 SELECT 결과를 파일로
-- 기존 표·뷰(review_relevance_verdicts·analysis_projects·v_input_area)는 이 마이그가 건드리지 않았으므로 되돌릴 것이 없다.

BEGIN;
DROP VIEW IF EXISTS public.v_input_area_effective;
DROP TRIGGER IF EXISTS review_area_verdicts_no_update ON public.review_area_verdicts;
DROP TABLE IF EXISTS public.review_area_verdicts;
DROP FUNCTION IF EXISTS public.review_area_verdicts_no_update();
COMMIT;

-- 확인: SELECT to_regclass('public.review_area_verdicts'), to_regclass('public.v_input_area_effective');  -- 둘 다 NULL
