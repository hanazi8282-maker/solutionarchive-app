-- target-revive 롤백 20261012T000038 — 6행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('995a69c1-9960-4c33-be98-0faee957319a'::uuid, 'exhausted', 0),
  ('9dea328c-0530-41d7-9249-f5ceb57d512a'::uuid, 'exhausted', 0),
  ('989f5bc2-3291-4866-993a-3fb6ed5b1857'::uuid, 'exhausted', 0),
  ('caa94fe9-c16c-428c-a8b3-1382181dac10'::uuid, 'exhausted', 0),
  ('ad23e00c-5708-4784-9620-ea3bca73ee2e'::uuid, 'exhausted', 0),
  ('fb7f2fda-0071-442f-bd9e-d101a91f1b09'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('995a69c1-9960-4c33-be98-0faee957319a', '9dea328c-0530-41d7-9249-f5ceb57d512a', '989f5bc2-3291-4866-993a-3fb6ed5b1857', 'caa94fe9-c16c-428c-a8b3-1382181dac10', 'ad23e00c-5708-4784-9620-ea3bca73ee2e', 'fb7f2fda-0071-442f-bd9e-d101a91f1b09') AND status = 'active';  -- 기대 0
