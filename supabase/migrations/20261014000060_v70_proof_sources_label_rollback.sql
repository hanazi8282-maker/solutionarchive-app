-- 20261014000060_v70_proof_sources_label 롤백 — 증명용 표시를 걷는다(소스 이름 접두 제거, 신규 프로젝트 4개 영역 NULL 복귀). 멱등.
BEGIN;

UPDATE public.review_sources
   SET display_name = regexp_replace(display_name, '^\[기계 동작 증명용\] ', '')
 WHERE key IN ('n8n_community','make_community','bubble_forum','retool_community','glide_community','softr_community');

UPDATE public.analysis_projects
   SET area_code = NULL, area_basis = NULL, area_rule_ver = NULL, area_assigned_at = NULL
 WHERE area_rule_ver = 'v70-proof';

COMMIT;
