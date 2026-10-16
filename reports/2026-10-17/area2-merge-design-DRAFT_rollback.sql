-- ⛔⛔ 초안 — area2-merge-design-DRAFT.sql [A] 를 되돌린다. 기록 표 public.area_merge_2_v71ad 의 이전 값 5칸을 그대로 복원한다.
--    합친 뒤 사람이 영역을 다시 손으로 고친 행(area_rule_ver <> 'merge-2-v71ad')은 건드리지 않는다. 기록 표는 감사용으로 남긴다.
--    [B](라벨 '2:'→'3:')를 썼다면 맨 아래 주석 블록도 돌린다.
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $$
BEGIN
  IF to_regclass('public.area_merge_2_v71ad') IS NULL THEN RAISE EXCEPTION '기록 표가 없다 — 정방향이 적용되지 않았다'; END IF;
END $$;

UPDATE public.analysis_projects p
   SET area_code = m.prev_area_code, area_basis = m.prev_area_basis, area_evidence = m.prev_area_evidence,
       area_rule_ver = m.prev_area_rule_ver, area_assigned_at = m.prev_area_assigned_at
  FROM public.area_merge_2_v71ad m
 WHERE p.id = m.project_id AND p.area_rule_ver = 'merge-2-v71ad';

DO $$
DECLARE still int; touched int;
BEGIN
  SELECT count(*) INTO still FROM public.analysis_projects WHERE area_rule_ver = 'merge-2-v71ad';
  SELECT count(*) INTO touched FROM public.area_merge_2_v71ad m JOIN public.analysis_projects p ON p.id = m.project_id
   WHERE p.area_code IS DISTINCT FROM m.prev_area_code;
  IF still <> 0 THEN RAISE EXCEPTION '%행이 아직 합친 상태다', still; END IF;
  RAISE NOTICE 'area merge rollback: 복원 완료 · 이전 값과 다른 행 %(합친 뒤 사람이 고친 행)', touched;
END $$;

COMMIT;

-- [B] 라벨 되돌리기(정방향 [B] 를 썼을 때만):
-- BEGIN;
-- UPDATE public.review_targets t SET label = r.prev_label FROM public.review_targets_relabel_2_v71ad r WHERE t.id = r.target_id AND t.label = '3:' || substr(r.prev_label, 3);
-- COMMIT;
