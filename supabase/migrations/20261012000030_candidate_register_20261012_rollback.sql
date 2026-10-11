-- ============================================================
-- 20261012000030_candidate_register_20261012 — ROLLBACK
--
-- ⛔ 미적용 초안. 삭제 없음:
--   · review_targets: 이 마이그가 넣은 행만(source_key, product_ref, label 정확히 일치) status='failed' — 자동 부활 대상 아님.
--   · analysis_projects: 이 마이그가 만든 행(소개문 정확히 일치 ∧ area_rule_ver='cand-reg-v1' ∧ area_basis='manual')의 영역 칸만 NULL.
--     행 자체는 남는다(수집 0건이면 아무 루프도 건드리지 않는 빈 collecting 프로젝트). 완전 삭제는 §10.2 예외 1번 — 사람 판단.
--     이 마이그가 재사용한(이미 있던) 프로젝트는 소개문이 달라 안 잡힌다.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';

-- 타깃 0행 — 되돌릴 review_targets 없음.

CREATE TEMP TABLE _cr_rb_p (pitch text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _cr_rb_p (pitch) VALUES
  ('HubSpot CRM — 승인 후보 등록(2026-10-12, ② 영업)'),
  ('Evernote — 승인 후보 등록(2026-10-12, 영역 외-노트·지식관리)'),
  ('Apple Notes — 승인 후보 등록(2026-10-12, 영역 외-노트·지식관리)'),
  ('Bear — 승인 후보 등록(2026-10-12, 영역 외-노트·지식관리)');

UPDATE public.analysis_projects p
   SET area_code = NULL, area_basis = NULL, area_evidence = NULL, area_rule_ver = NULL, area_assigned_at = NULL
  FROM _cr_rb_p r
 WHERE p.product_elevator_pitch = r.pitch AND p.area_rule_ver = 'cand-reg-v1' AND p.area_basis = 'manual';

DO $$
DECLARE still int;
BEGIN
  SELECT count(*) INTO still FROM public.analysis_projects p JOIN _cr_rb_p r ON r.pitch = p.product_elevator_pitch WHERE p.area_rule_ver = 'cand-reg-v1';
  IF still <> 0 THEN RAISE EXCEPTION '%행의 영역이 아직 남아 있다', still; END IF;
END $$;

COMMIT;
