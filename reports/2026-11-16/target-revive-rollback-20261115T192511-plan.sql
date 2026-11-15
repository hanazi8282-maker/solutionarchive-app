-- target-revive 롤백 20261115T192511 — 8행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('3389a769-27ef-4fb9-9b4e-8ca07e248f6b'::uuid, 'exhausted', 30),
  ('e8d51ec0-cfb9-49b7-9036-0970dc9c8380'::uuid, 'exhausted', 4),
  ('ef6b0810-a41d-47a7-a2f6-733daf08dce3'::uuid, 'exhausted', 0),
  ('6f8690ca-dc94-427d-a37c-5107d1c3bf30'::uuid, 'exhausted', 0),
  ('60f5e5c0-d257-4988-8989-2f2620918b2d'::uuid, 'exhausted', 0),
  ('34344d8f-5197-4588-85b4-42a15274cf64'::uuid, 'exhausted', 0),
  ('65e03834-0c15-4e97-ba66-d1841ac3a564'::uuid, 'exhausted', 0),
  ('c3fb61ea-f639-49fd-9ad1-012cf8dc8570'::uuid, 'exhausted', 2)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('3389a769-27ef-4fb9-9b4e-8ca07e248f6b', 'e8d51ec0-cfb9-49b7-9036-0970dc9c8380', 'ef6b0810-a41d-47a7-a2f6-733daf08dce3', '6f8690ca-dc94-427d-a37c-5107d1c3bf30', '60f5e5c0-d257-4988-8989-2f2620918b2d', '34344d8f-5197-4588-85b4-42a15274cf64', '65e03834-0c15-4e97-ba66-d1841ac3a564', 'c3fb61ea-f639-49fd-9ad1-012cf8dc8570') AND status = 'active';  -- 기대 0
