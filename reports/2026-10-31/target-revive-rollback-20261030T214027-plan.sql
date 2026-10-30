-- target-revive 롤백 20261030T214027 — 7행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('fd63e425-c4ed-4858-b512-bc17813ec242'::uuid, 'exhausted', 4),
  ('15c6b312-859a-4605-87e7-363e1e5f2ec8'::uuid, 'exhausted', 1),
  ('41d7e307-a7f2-4571-9b96-56b18a446920'::uuid, 'exhausted', 1),
  ('6f35d7f2-1395-4be3-beee-cb355f48c9b8'::uuid, 'exhausted', 1),
  ('c6dfa3fb-6cc1-4d3a-ae97-57663a1203a8'::uuid, 'exhausted', 1),
  ('5a762ff6-d81e-42a7-a605-3f0c223054ba'::uuid, 'exhausted', 1),
  ('bbd4cf3f-3365-4d4e-ba16-3be4d226c818'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('fd63e425-c4ed-4858-b512-bc17813ec242', '15c6b312-859a-4605-87e7-363e1e5f2ec8', '41d7e307-a7f2-4571-9b96-56b18a446920', '6f35d7f2-1395-4be3-beee-cb355f48c9b8', 'c6dfa3fb-6cc1-4d3a-ae97-57663a1203a8', '5a762ff6-d81e-42a7-a605-3f0c223054ba', 'bbd4cf3f-3365-4d4e-ba16-3be4d226c818') AND status = 'active';  -- 기대 0
