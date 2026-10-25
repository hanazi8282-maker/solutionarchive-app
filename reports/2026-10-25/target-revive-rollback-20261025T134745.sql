-- target-revive 롤백 20261025T134745 — 2행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('f5b3a078-fb65-4423-aea7-7bb7e6ac3c9c'::uuid, 'exhausted', 3),
  ('b2e3d93d-2901-4574-b4e7-457d834380bb'::uuid, 'exhausted', 3)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('f5b3a078-fb65-4423-aea7-7bb7e6ac3c9c', 'b2e3d93d-2901-4574-b4e7-457d834380bb') AND status = 'active';  -- 기대 0
