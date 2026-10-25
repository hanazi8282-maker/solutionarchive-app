-- 롤백: 'work' 행이 있으면 ADD CONSTRAINT 가 실패해 아무것도 바뀌지 않는다(그 경우 먼저 사람이 'work' 행의 처리를 정한다).
BEGIN;
ALTER TABLE public.analysis_projects DROP CONSTRAINT IF EXISTS analysis_projects_area_code_check;
ALTER TABLE public.analysis_projects ADD CONSTRAINT analysis_projects_area_code_check
  CHECK (area_code IS NULL OR area_code IN ('1', '2', '3', '4', '5', 'design', 'hold', 'out-consumer', 'out-founder'));
COMMIT;
