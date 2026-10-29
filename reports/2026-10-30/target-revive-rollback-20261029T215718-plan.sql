-- target-revive 롤백 20261029T215718 — 7행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('c6c1c231-ffbf-4cee-9b14-68a0b61a8166'::uuid, 'exhausted', 4),
  ('686cf8b1-86d0-4062-ae98-e6374caad885'::uuid, 'exhausted', 1),
  ('b630d013-9a5c-47f8-afdb-8ec1b285835a'::uuid, 'exhausted', 1),
  ('d9436cfc-596d-4b4c-bb69-d81eb6a484e1'::uuid, 'exhausted', 1),
  ('8f3004f0-25a4-4f4a-b9a8-ce69fd9b5dee'::uuid, 'exhausted', 1),
  ('b21f82c7-3fa7-49c8-a2e0-65b77ed8df47'::uuid, 'exhausted', 1),
  ('f5b738a4-46ea-43af-af5f-b383b65a1e20'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('c6c1c231-ffbf-4cee-9b14-68a0b61a8166', '686cf8b1-86d0-4062-ae98-e6374caad885', 'b630d013-9a5c-47f8-afdb-8ec1b285835a', 'd9436cfc-596d-4b4c-bb69-d81eb6a484e1', '8f3004f0-25a4-4f4a-b9a8-ce69fd9b5dee', 'b21f82c7-3fa7-49c8-a2e0-65b77ed8df47', 'f5b738a4-46ea-43af-af5f-b383b65a1e20') AND status = 'active';  -- 기대 0
