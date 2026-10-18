-- target-revive 롤백 20261018T223802 — 3행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('90ec0b32-cee1-4ced-9237-301f89bb6a61'::uuid, 'exhausted', 0),
  ('995a69c1-9960-4c33-be98-0faee957319a'::uuid, 'exhausted', 0),
  ('860442ac-6d63-4caf-b8bf-cb30e2038c6f'::uuid, 'exhausted', 3)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('90ec0b32-cee1-4ced-9237-301f89bb6a61', '995a69c1-9960-4c33-be98-0faee957319a', '860442ac-6d63-4caf-b8bf-cb30e2038c6f') AND status = 'active';  -- 기대 0
