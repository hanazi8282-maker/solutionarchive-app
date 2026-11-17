-- target-revive 롤백 20261117T214950 — 5행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('703ff17e-c4f7-43cb-be2f-7749fb95d2c6'::uuid, 'exhausted', 2),
  ('3adb279e-edd8-4180-99b2-1b0f488b054e'::uuid, 'exhausted', 2),
  ('ad8c63d0-60ee-4a77-86a3-dedeb4d09d98'::uuid, 'exhausted', 2),
  ('b62b614b-d717-4c80-b932-410a2ddf72ae'::uuid, 'exhausted', 2),
  ('ecfe3e7a-2dd8-484a-ad55-201e30e03717'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('703ff17e-c4f7-43cb-be2f-7749fb95d2c6', '3adb279e-edd8-4180-99b2-1b0f488b054e', 'ad8c63d0-60ee-4a77-86a3-dedeb4d09d98', 'b62b614b-d717-4c80-b932-410a2ddf72ae', 'ecfe3e7a-2dd8-484a-ad55-201e30e03717') AND status = 'active';  -- 기대 0
