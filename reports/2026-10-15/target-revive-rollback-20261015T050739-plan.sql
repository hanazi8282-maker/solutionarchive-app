-- target-revive 롤백 20261015T050739 — 4행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('b02213be-da26-4ff3-97b3-348f86c9efb0'::uuid, 'exhausted', 0),
  ('e5299fd3-b630-40c2-83c0-2abcdb86bad1'::uuid, 'exhausted', 0),
  ('3e48dadb-1868-42a9-aa23-41d93c42d4ad'::uuid, 'exhausted', 0),
  ('995a69c1-9960-4c33-be98-0faee957319a'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('b02213be-da26-4ff3-97b3-348f86c9efb0', 'e5299fd3-b630-40c2-83c0-2abcdb86bad1', '3e48dadb-1868-42a9-aa23-41d93c42d4ad', '995a69c1-9960-4c33-be98-0faee957319a') AND status = 'active';  -- 기대 0
