-- target-revive 롤백 20261102T193818 — 4행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('8d3b21d4-c6d1-4703-bbac-52de758fef64'::uuid, 'exhausted', 0),
  ('fb7f2fda-0071-442f-bd9e-d101a91f1b09'::uuid, 'exhausted', 0),
  ('995a69c1-9960-4c33-be98-0faee957319a'::uuid, 'exhausted', 0),
  ('fe28d8de-1ab9-4e04-a5c7-692373ed9fe2'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('8d3b21d4-c6d1-4703-bbac-52de758fef64', 'fb7f2fda-0071-442f-bd9e-d101a91f1b09', '995a69c1-9960-4c33-be98-0faee957319a', 'fe28d8de-1ab9-4e04-a5c7-692373ed9fe2') AND status = 'active';  -- 기대 0
