-- 롤백: 20261026000010_area_fill_hn_products_v71be — 이 규칙이 부여한 행만 NULL 로 되돌린다.
BEGIN;
UPDATE public.analysis_projects
   SET area_code = NULL, area_basis = NULL, area_rule_ver = NULL, area_evidence = NULL, area_assigned_at = NULL
 WHERE area_rule_ver = 'v71be-1' AND area_basis = 'manual';
COMMIT;
