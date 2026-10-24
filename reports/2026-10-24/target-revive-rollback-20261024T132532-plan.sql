-- target-revive 롤백 20261024T132532 — 3행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('c0bb6414-8ecc-4128-84b9-0c37e889a1b4'::uuid, 'exhausted', 3),
  ('57b82620-6593-48ff-895d-4fe4413d6348'::uuid, 'exhausted', 3),
  ('a42ead18-426a-4c58-8525-764934d3b109'::uuid, 'exhausted', 3)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('c0bb6414-8ecc-4128-84b9-0c37e889a1b4', '57b82620-6593-48ff-895d-4fe4413d6348', 'a42ead18-426a-4c58-8525-764934d3b109') AND status = 'active';  -- 기대 0
