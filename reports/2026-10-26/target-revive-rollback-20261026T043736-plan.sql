-- target-revive 롤백 20261026T043736 — 9행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('9dea328c-0530-41d7-9249-f5ceb57d512a'::uuid, 'exhausted', 1),
  ('989f5bc2-3291-4866-993a-3fb6ed5b1857'::uuid, 'exhausted', 0),
  ('caa94fe9-c16c-428c-a8b3-1382181dac10'::uuid, 'exhausted', 0),
  ('ad23e00c-5708-4784-9620-ea3bca73ee2e'::uuid, 'exhausted', 1),
  ('fb7f2fda-0071-442f-bd9e-d101a91f1b09'::uuid, 'exhausted', 0),
  ('e63413dd-d818-4596-8d75-d3bdca14a35b'::uuid, 'exhausted', 0),
  ('2b49c14a-a7dc-4d4f-ac69-3a59d06b6832'::uuid, 'exhausted', 1),
  ('bd2cf657-e888-4afb-bb93-f72650e581f0'::uuid, 'exhausted', 0),
  ('0c5f87cd-d2c0-4257-a79c-a9649eae3ae2'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('9dea328c-0530-41d7-9249-f5ceb57d512a', '989f5bc2-3291-4866-993a-3fb6ed5b1857', 'caa94fe9-c16c-428c-a8b3-1382181dac10', 'ad23e00c-5708-4784-9620-ea3bca73ee2e', 'fb7f2fda-0071-442f-bd9e-d101a91f1b09', 'e63413dd-d818-4596-8d75-d3bdca14a35b', '2b49c14a-a7dc-4d4f-ac69-3a59d06b6832', 'bd2cf657-e888-4afb-bb93-f72650e581f0', '0c5f87cd-d2c0-4257-a79c-a9649eae3ae2') AND status = 'active';  -- 기대 0
