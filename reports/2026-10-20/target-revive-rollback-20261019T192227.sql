-- target-revive 롤백 20261019T192227 — 1행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('cd6dd1c0-3bea-4d5a-bba9-d2b023e02b46'::uuid, 'exhausted', 3)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('cd6dd1c0-3bea-4d5a-bba9-d2b023e02b46') AND status = 'active';  -- 기대 0
