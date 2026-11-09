-- target-revive 롤백 20261109T084159 — 8행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('a6e8a562-e921-4b0f-8dc6-6220576b0e8e'::uuid, 'exhausted', 0),
  ('8787c745-6064-40bb-a41c-5bd51f4b06bb'::uuid, 'exhausted', 0),
  ('f25103ea-4231-4799-8d93-cf36e6fa42f1'::uuid, 'exhausted', 0),
  ('934a21ff-7d06-4305-9d42-cb6666571b15'::uuid, 'exhausted', 0),
  ('a773ca1f-0170-4f89-95d8-ca098cbeb0b4'::uuid, 'exhausted', 0),
  ('989f5bc2-3291-4866-993a-3fb6ed5b1857'::uuid, 'exhausted', 1),
  ('caa94fe9-c16c-428c-a8b3-1382181dac10'::uuid, 'exhausted', 1),
  ('ad23e00c-5708-4784-9620-ea3bca73ee2e'::uuid, 'exhausted', 2)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('a6e8a562-e921-4b0f-8dc6-6220576b0e8e', '8787c745-6064-40bb-a41c-5bd51f4b06bb', 'f25103ea-4231-4799-8d93-cf36e6fa42f1', '934a21ff-7d06-4305-9d42-cb6666571b15', 'a773ca1f-0170-4f89-95d8-ca098cbeb0b4', '989f5bc2-3291-4866-993a-3fb6ed5b1857', 'caa94fe9-c16c-428c-a8b3-1382181dac10', 'ad23e00c-5708-4784-9620-ea3bca73ee2e') AND status = 'active';  -- 기대 0
