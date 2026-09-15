-- 롤백: 20260916000002_case_moves_fact_check_grade.sql
ALTER TABLE public.case_moves DROP CONSTRAINT IF EXISTS case_moves_fact_check_grade_check;
ALTER TABLE public.case_moves DROP COLUMN IF EXISTS fact_check_grade;
COMMENT ON COLUMN public.case_moves.evidence_grade IS NULL;
