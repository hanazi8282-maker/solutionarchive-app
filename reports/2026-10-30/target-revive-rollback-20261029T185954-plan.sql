-- target-revive 롤백 20261029T185954 — 9행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('a7f18f8d-374d-445c-a260-f978e329c083'::uuid, 'exhausted', 3),
  ('a76c9974-8f74-400d-bed9-50cf5017859c'::uuid, 'exhausted', 3),
  ('fe28d8de-1ab9-4e04-a5c7-692373ed9fe2'::uuid, 'exhausted', 0),
  ('346d863e-e882-4ae8-a9e9-529251358654'::uuid, 'exhausted', 1),
  ('6385b55b-ede0-4883-b29c-a9b763162d8d'::uuid, 'exhausted', 1),
  ('c37488d3-3743-47a0-8759-718d1dd28bd2'::uuid, 'exhausted', 1),
  ('4e2f9493-fde7-4317-8b1c-c6320457de48'::uuid, 'exhausted', 1),
  ('ffd06af9-b3a1-462a-8785-f2f768330b82'::uuid, 'exhausted', 1),
  ('f7d50e3f-64fb-4d20-93c7-3dee7798a4d6'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('a7f18f8d-374d-445c-a260-f978e329c083', 'a76c9974-8f74-400d-bed9-50cf5017859c', 'fe28d8de-1ab9-4e04-a5c7-692373ed9fe2', '346d863e-e882-4ae8-a9e9-529251358654', '6385b55b-ede0-4883-b29c-a9b763162d8d', 'c37488d3-3743-47a0-8759-718d1dd28bd2', '4e2f9493-fde7-4317-8b1c-c6320457de48', 'ffd06af9-b3a1-462a-8785-f2f768330b82', 'f7d50e3f-64fb-4d20-93c7-3dee7798a4d6') AND status = 'active';  -- 기대 0
