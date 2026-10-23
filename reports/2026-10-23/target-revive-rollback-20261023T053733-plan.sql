-- target-revive 롤백 20261023T053733 — 1행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('8d3b21d4-c6d1-4703-bbac-52de758fef64'::uuid, 'exhausted', 4)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('8d3b21d4-c6d1-4703-bbac-52de758fef64') AND status = 'active';  -- 기대 0
