-- target-revive 롤백 20261107T060803 — 9행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('973dba5c-6404-4805-b132-8045bd25fc94'::uuid, 'exhausted', 1),
  ('3c3f4679-25d4-4646-9bbc-9c5c2f7bc031'::uuid, 'exhausted', 1),
  ('0c97f01a-43e3-47c0-98fa-f57163b5e5f2'::uuid, 'exhausted', 1),
  ('9644d75d-4def-4ba9-b52d-0b1de1da407a'::uuid, 'exhausted', 1),
  ('6cfbb1ca-2a8b-44ed-886b-355cc4575e4b'::uuid, 'exhausted', 1),
  ('a7c81ecb-c2c0-4ebe-9cd3-524c3ce9bbe1'::uuid, 'exhausted', 3),
  ('9ea60984-cca2-491b-a187-2af509dc78a1'::uuid, 'exhausted', 3),
  ('11d168fc-fb2c-4334-b800-0beb6e7303bf'::uuid, 'exhausted', 12),
  ('17790f7a-6857-4b32-ace1-2183730b1868'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('973dba5c-6404-4805-b132-8045bd25fc94', '3c3f4679-25d4-4646-9bbc-9c5c2f7bc031', '0c97f01a-43e3-47c0-98fa-f57163b5e5f2', '9644d75d-4def-4ba9-b52d-0b1de1da407a', '6cfbb1ca-2a8b-44ed-886b-355cc4575e4b', 'a7c81ecb-c2c0-4ebe-9cd3-524c3ce9bbe1', '9ea60984-cca2-491b-a187-2af509dc78a1', '11d168fc-fb2c-4334-b800-0beb6e7303bf', '17790f7a-6857-4b32-ace1-2183730b1868') AND status = 'active';  -- 기대 0
