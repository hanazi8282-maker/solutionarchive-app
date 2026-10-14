-- target-revive 롤백 20261014T232826 — 2행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('759f6661-5bad-43b4-a1cc-f69632b80bc8'::uuid, 'exhausted', 0),
  ('90ec0b32-cee1-4ced-9237-301f89bb6a61'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('759f6661-5bad-43b4-a1cc-f69632b80bc8', '90ec0b32-cee1-4ced-9237-301f89bb6a61') AND status = 'active';  -- 기대 0
