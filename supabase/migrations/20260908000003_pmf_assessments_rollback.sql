-- 롤백: 20260908000003_pmf_assessments
--
-- 생성 역순. pmf_assessment_moves 가 pmf_assessments 를 참조하므로 먼저 지운다.
-- 이 롤백은 001/002 와 독립이다 (agent_runs 를 참조하지 않는다).
--
-- ⚠️ 진단 이력이 사라진다. input jsonb 를 보존하려면 먼저 백업한다:
--    COPY (SELECT * FROM public.pmf_assessments) TO '/tmp/pmf_backup.csv' CSV HEADER;

BEGIN;

DROP INDEX IF EXISTS public.pmf_assessment_moves_move_idx;
DROP INDEX IF EXISTS public.pmf_assessment_moves_assessment_idx;
DROP TABLE IF EXISTS public.pmf_assessment_moves;

DROP INDEX IF EXISTS public.pmf_assessments_project_idx;
DROP INDEX IF EXISTS public.pmf_assessments_created_idx;
DROP TABLE IF EXISTS public.pmf_assessments;

COMMIT;

-- 확인
-- SELECT table_name FROM information_schema.tables
--  WHERE table_schema='public' AND table_name IN ('pmf_assessments','pmf_assessment_moves');
--   기대: 0행
