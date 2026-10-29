-- target-revive 롤백 20261029T114327 — 4행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('e5838453-e8fc-4811-96ef-c62f0d733bd1'::uuid, 'exhausted', 3),
  ('bb8a3a5c-44d4-45a6-accc-4f5d9e08837a'::uuid, 'exhausted', 1),
  ('1e9c2681-0a36-4380-98a8-c37422633e2a'::uuid, 'exhausted', 1),
  ('168aa141-59f9-4e59-a01d-6aaecd197961'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('e5838453-e8fc-4811-96ef-c62f0d733bd1', 'bb8a3a5c-44d4-45a6-accc-4f5d9e08837a', '1e9c2681-0a36-4380-98a8-c37422633e2a', '168aa141-59f9-4e59-a01d-6aaecd197961') AND status = 'active';  -- 기대 0
