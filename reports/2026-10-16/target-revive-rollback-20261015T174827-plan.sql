-- target-revive 롤백 20261015T174827 — 6행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('686d7129-d0ff-462f-8742-4a314a3a0185'::uuid, 'exhausted', 3),
  ('5eda3625-834b-4c94-b19e-87f5f0207fb4'::uuid, 'exhausted', 3),
  ('28e72b40-0a88-4a2d-89dc-b876d24327ff'::uuid, 'exhausted', 3),
  ('43a4b4ac-3ec5-446e-9e81-681f4d183154'::uuid, 'exhausted', 3),
  ('c6875e78-1706-4e7f-b102-0c2c6d771886'::uuid, 'exhausted', 0),
  ('c6c1c231-ffbf-4cee-9b14-68a0b61a8166'::uuid, 'exhausted', 3)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('686d7129-d0ff-462f-8742-4a314a3a0185', '5eda3625-834b-4c94-b19e-87f5f0207fb4', '28e72b40-0a88-4a2d-89dc-b876d24327ff', '43a4b4ac-3ec5-446e-9e81-681f4d183154', 'c6875e78-1706-4e7f-b102-0c2c6d771886', 'c6c1c231-ffbf-4cee-9b14-68a0b61a8166') AND status = 'active';  -- 기대 0
