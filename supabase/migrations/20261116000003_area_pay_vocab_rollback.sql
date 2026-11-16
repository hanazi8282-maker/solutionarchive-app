-- 롤백: 'pay' 행을 NULL + hold 표시로 되돌린 뒤 CHECK 를 'work' 어휘로 복원한다.
BEGIN;
UPDATE public.analysis_projects SET area_code = NULL, area_evidence = 'hold:payments_billing_accounting(areas_v2)', area_rule_ver = 'v71cp' WHERE area_code = 'pay';
ALTER TABLE public.analysis_projects DROP CONSTRAINT IF EXISTS analysis_projects_area_code_check;
ALTER TABLE public.analysis_projects ADD CONSTRAINT analysis_projects_area_code_check
  CHECK (area_code IS NULL OR area_code IN ('1', '2', '3', '4', '5', 'work', 'design', 'hold', 'out-consumer', 'out-founder'));
COMMIT;
