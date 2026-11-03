-- target-revive 롤백 20261103T171200 — 1행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('a4e3e9f2-ea09-4134-8f44-5517fe69652e'::uuid, 'exhausted', 3)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('a4e3e9f2-ea09-4134-8f44-5517fe69652e') AND status = 'active';  -- 기대 0
