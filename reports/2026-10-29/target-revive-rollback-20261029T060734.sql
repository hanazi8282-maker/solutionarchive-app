-- target-revive 롤백 20261029T060734 — 11행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('29ab231f-8e97-4a9f-93bd-91dffdc49371'::uuid, 'exhausted', 3),
  ('015c8f00-8c78-4faa-b8fe-f41485b55799'::uuid, 'exhausted', 3),
  ('89c26dd5-53ea-44a5-882c-be2da796a6a9'::uuid, 'exhausted', 3),
  ('759f6661-5bad-43b4-a1cc-f69632b80bc8'::uuid, 'exhausted', 1),
  ('1adcda6c-68cc-4d66-977f-3d798194eca7'::uuid, 'exhausted', 1),
  ('ef6b0810-a41d-47a7-a2f6-733daf08dce3'::uuid, 'exhausted', 1),
  ('6f8690ca-dc94-427d-a37c-5107d1c3bf30'::uuid, 'exhausted', 1),
  ('60f5e5c0-d257-4988-8989-2f2620918b2d'::uuid, 'exhausted', 1),
  ('34344d8f-5197-4588-85b4-42a15274cf64'::uuid, 'exhausted', 1),
  ('65e03834-0c15-4e97-ba66-d1841ac3a564'::uuid, 'exhausted', 1),
  ('8cee7596-9be1-4e1e-b9da-65503e3bf005'::uuid, 'exhausted', 3)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('29ab231f-8e97-4a9f-93bd-91dffdc49371', '015c8f00-8c78-4faa-b8fe-f41485b55799', '89c26dd5-53ea-44a5-882c-be2da796a6a9', '759f6661-5bad-43b4-a1cc-f69632b80bc8', '1adcda6c-68cc-4d66-977f-3d798194eca7', 'ef6b0810-a41d-47a7-a2f6-733daf08dce3', '6f8690ca-dc94-427d-a37c-5107d1c3bf30', '60f5e5c0-d257-4988-8989-2f2620918b2d', '34344d8f-5197-4588-85b4-42a15274cf64', '65e03834-0c15-4e97-ba66-d1841ac3a564', '8cee7596-9be1-4e1e-b9da-65503e3bf005') AND status = 'active';  -- 기대 0
