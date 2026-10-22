-- target-revive 롤백 20261022T204511 — 10행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('29d3d12d-731d-4143-b14d-572c0ae2ae12'::uuid, 'exhausted', 0),
  ('a5f05222-2b09-415f-95cd-4dbb491b753c'::uuid, 'exhausted', 0),
  ('56665469-1087-4950-9c84-e4d5bfa30096'::uuid, 'exhausted', 0),
  ('91f1542c-5757-4ba6-bd2f-ba85161dda5a'::uuid, 'exhausted', 0),
  ('3fb3a62f-d19f-4815-a3cc-a8821c74699f'::uuid, 'exhausted', 0),
  ('59de0327-db16-4385-95ee-a101ac98ac7e'::uuid, 'exhausted', 0),
  ('69e81755-db97-44c3-9633-7247c8f13b7d'::uuid, 'exhausted', 3),
  ('a7c81ecb-c2c0-4ebe-9cd3-524c3ce9bbe1'::uuid, 'exhausted', 3),
  ('90ec0b32-cee1-4ced-9237-301f89bb6a61'::uuid, 'exhausted', 0),
  ('995a69c1-9960-4c33-be98-0faee957319a'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('29d3d12d-731d-4143-b14d-572c0ae2ae12', 'a5f05222-2b09-415f-95cd-4dbb491b753c', '56665469-1087-4950-9c84-e4d5bfa30096', '91f1542c-5757-4ba6-bd2f-ba85161dda5a', '3fb3a62f-d19f-4815-a3cc-a8821c74699f', '59de0327-db16-4385-95ee-a101ac98ac7e', '69e81755-db97-44c3-9633-7247c8f13b7d', 'a7c81ecb-c2c0-4ebe-9cd3-524c3ce9bbe1', '90ec0b32-cee1-4ced-9237-301f89bb6a61', '995a69c1-9960-4c33-be98-0faee957319a') AND status = 'active';  -- 기대 0
