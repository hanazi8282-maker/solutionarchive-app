-- target-revive 롤백 20261116T083751 — 11행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('6385b55b-ede0-4883-b29c-a9b763162d8d'::uuid, 'exhausted', 0),
  ('c37488d3-3743-47a0-8759-718d1dd28bd2'::uuid, 'exhausted', 0),
  ('4e2f9493-fde7-4317-8b1c-c6320457de48'::uuid, 'exhausted', 0),
  ('ffd06af9-b3a1-462a-8785-f2f768330b82'::uuid, 'exhausted', 0),
  ('f7d50e3f-64fb-4d20-93c7-3dee7798a4d6'::uuid, 'exhausted', 0),
  ('686cf8b1-86d0-4062-ae98-e6374caad885'::uuid, 'exhausted', 0),
  ('ae45b7fb-1311-42ae-91bb-13187538b891'::uuid, 'exhausted', 1),
  ('c87397f5-3823-4a50-8e21-f661546cca8b'::uuid, 'exhausted', 1),
  ('60eb4db9-62b3-4e7a-947c-b03b40e0bc4b'::uuid, 'exhausted', 1),
  ('542f302b-c271-470e-8a77-78ac90641b0d'::uuid, 'exhausted', 0),
  ('43bcdbc6-c231-48b8-84d9-d8c2e0d72fe5'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('6385b55b-ede0-4883-b29c-a9b763162d8d', 'c37488d3-3743-47a0-8759-718d1dd28bd2', '4e2f9493-fde7-4317-8b1c-c6320457de48', 'ffd06af9-b3a1-462a-8785-f2f768330b82', 'f7d50e3f-64fb-4d20-93c7-3dee7798a4d6', '686cf8b1-86d0-4062-ae98-e6374caad885', 'ae45b7fb-1311-42ae-91bb-13187538b891', 'c87397f5-3823-4a50-8e21-f661546cca8b', '60eb4db9-62b3-4e7a-947c-b03b40e0bc4b', '542f302b-c271-470e-8a77-78ac90641b0d', '43bcdbc6-c231-48b8-84d9-d8c2e0d72fe5') AND status = 'active';  -- 기대 0
