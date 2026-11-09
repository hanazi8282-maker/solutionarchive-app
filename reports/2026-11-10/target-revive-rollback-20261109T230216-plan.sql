-- target-revive 롤백 20261109T230216 — 8행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('12950bac-f896-41a2-a5b3-5918f7bc0834'::uuid, 'exhausted', 30),
  ('5d318405-12ad-4592-9c1a-dceb9b6c67fd'::uuid, 'exhausted', 4),
  ('1e69268a-21c0-4f0c-a9d7-3f058f3f4e76'::uuid, 'exhausted', 4),
  ('0f07e341-17df-4bd7-8514-49b779836eb5'::uuid, 'exhausted', 0),
  ('e53b7095-bb28-490b-a2a3-c0f57d7a8ec5'::uuid, 'exhausted', 0),
  ('7e0ddd91-2209-457b-8123-ff1cafc78d90'::uuid, 'exhausted', 0),
  ('a2709f3f-0247-424a-89ef-a0cde6995415'::uuid, 'exhausted', 0),
  ('58e5f4f6-869c-49f6-b667-64911a422047'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('12950bac-f896-41a2-a5b3-5918f7bc0834', '5d318405-12ad-4592-9c1a-dceb9b6c67fd', '1e69268a-21c0-4f0c-a9d7-3f058f3f4e76', '0f07e341-17df-4bd7-8514-49b779836eb5', 'e53b7095-bb28-490b-a2a3-c0f57d7a8ec5', '7e0ddd91-2209-457b-8123-ff1cafc78d90', 'a2709f3f-0247-424a-89ef-a0cde6995415', '58e5f4f6-869c-49f6-b667-64911a422047') AND status = 'active';  -- 기대 0
