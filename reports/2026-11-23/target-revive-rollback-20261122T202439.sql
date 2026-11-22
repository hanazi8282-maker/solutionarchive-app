-- target-revive 롤백 20261122T202439 — 2행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('b65b25ef-7a9e-4381-840b-8e2d5e77a7f3'::uuid, 'exhausted', 4),
  ('ad23e00c-5708-4784-9620-ea3bca73ee2e'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('b65b25ef-7a9e-4381-840b-8e2d5e77a7f3', 'ad23e00c-5708-4784-9620-ea3bca73ee2e') AND status = 'active';  -- 기대 0
