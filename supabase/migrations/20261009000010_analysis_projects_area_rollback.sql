-- ============================================================
-- 20261009000010_analysis_projects_area_rollback
--
-- 되돌리는 범위: area_rule_ver = 'v37-1' 인 행의 영역 열 5개만 NULL. 다른 버전·사람이 넣은 값(manual 등)은 그대로.
-- 열·CHECK 는 남긴다(DROP COLUMN 은 §10.2 예외 1번). 뷰 v_input_area 는 데이터가 없는 읽기 뷰라 DROP 한다.
-- 다시 적용하려면 정방향 파일을 그대로 돌리면 된다(area_code IS NULL 행만 채운다).
-- ⚠️ 미적용 — 서브에이전트가 만든 파일이다.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

DROP VIEW IF EXISTS public.v_input_area;

CREATE TEMP TABLE _area_rb_before ON COMMIT DROP AS
SELECT md5(coalesce(string_agg((to_jsonb(p) - ARRAY['area_code','area_basis','area_evidence','area_rule_ver','area_assigned_at'])::text, '|' ORDER BY p.id), '')) AS projects_hash,
       count(*) FILTER (WHERE area_code IS NOT NULL AND area_rule_ver IS DISTINCT FROM 'v37-1') AS others
  FROM public.analysis_projects p;

UPDATE public.analysis_projects
   SET area_code = NULL, area_basis = NULL, area_evidence = NULL, area_rule_ver = NULL, area_assigned_at = NULL
 WHERE area_rule_ver = 'v37-1';

DO $$
DECLARE b record; v_left int; v_others int; v_hash text;
BEGIN
  SELECT * INTO b FROM _area_rb_before;
  SELECT count(*) INTO v_left FROM public.analysis_projects WHERE area_rule_ver = 'v37-1';
  IF v_left <> 0 THEN RAISE EXCEPTION 'v37-1 행 %개가 남았다', v_left; END IF;
  SELECT count(*) INTO v_others FROM public.analysis_projects WHERE area_code IS NOT NULL;
  IF v_others <> b.others THEN RAISE EXCEPTION '다른 버전 행 수가 바뀌었다: % → %', b.others, v_others; END IF;
  SELECT md5(coalesce(string_agg((to_jsonb(p) - ARRAY['area_code','area_basis','area_evidence','area_rule_ver','area_assigned_at'])::text, '|' ORDER BY p.id), ''))
    INTO v_hash FROM public.analysis_projects p;
  IF v_hash <> b.projects_hash THEN RAISE EXCEPTION 'analysis_projects 기존 열이 바뀌었다'; END IF;
  RAISE NOTICE '영역 소급 v37-1 롤백 완료 · 남은 다른 버전 부여 %행', v_others;
END $$;

COMMIT;
