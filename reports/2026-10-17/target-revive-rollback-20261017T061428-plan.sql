-- target-revive 롤백 20261017T061428 — 1행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('fafe1a8e-dd42-41d1-b838-b133a18377b3'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('fafe1a8e-dd42-41d1-b838-b133a18377b3') AND status = 'active';  -- 기대 0
