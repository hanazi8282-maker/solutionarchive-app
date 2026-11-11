-- target-revive 롤백 20261111T005557 — 6행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('3bb9cc9b-6976-4622-b8a0-4665495d66f7'::uuid, 'exhausted', 1),
  ('abb55c64-ae87-4f85-a0cf-ac887fd6ac53'::uuid, 'exhausted', 1),
  ('e63413dd-d818-4596-8d75-d3bdca14a35b'::uuid, 'exhausted', 1),
  ('2b49c14a-a7dc-4d4f-ac69-3a59d06b6832'::uuid, 'exhausted', 2),
  ('bd2cf657-e888-4afb-bb93-f72650e581f0'::uuid, 'exhausted', 1),
  ('0c5f87cd-d2c0-4257-a79c-a9649eae3ae2'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('3bb9cc9b-6976-4622-b8a0-4665495d66f7', 'abb55c64-ae87-4f85-a0cf-ac887fd6ac53', 'e63413dd-d818-4596-8d75-d3bdca14a35b', '2b49c14a-a7dc-4d4f-ac69-3a59d06b6832', 'bd2cf657-e888-4afb-bb93-f72650e581f0', '0c5f87cd-d2c0-4257-a79c-a9649eae3ae2') AND status = 'active';  -- 기대 0
