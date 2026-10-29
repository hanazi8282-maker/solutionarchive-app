-- target-revive 롤백 20261029T074111 — 8행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('c3fb61ea-f639-49fd-9ad1-012cf8dc8570'::uuid, 'exhausted', 1),
  ('f75529e5-d498-443e-99c0-94ac6f82bd04'::uuid, 'exhausted', 1),
  ('7d8ecf8b-65d3-431d-a86a-07592fc67af9'::uuid, 'exhausted', 1),
  ('c7d69c93-2b19-47f9-a2ad-1988a828ff6b'::uuid, 'exhausted', 1),
  ('14a4e9a2-c3ef-444c-874d-100c67e67ce0'::uuid, 'exhausted', 1),
  ('f64f1992-a88e-41e8-ac4b-12f1456d8630'::uuid, 'exhausted', 1),
  ('a90b47fb-8473-4cfd-8e01-f1182afcbd6f'::uuid, 'exhausted', 3),
  ('276d436d-6a8f-42ee-864f-480d564a95e5'::uuid, 'exhausted', 3)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('c3fb61ea-f639-49fd-9ad1-012cf8dc8570', 'f75529e5-d498-443e-99c0-94ac6f82bd04', '7d8ecf8b-65d3-431d-a86a-07592fc67af9', 'c7d69c93-2b19-47f9-a2ad-1988a828ff6b', '14a4e9a2-c3ef-444c-874d-100c67e67ce0', 'f64f1992-a88e-41e8-ac4b-12f1456d8630', 'a90b47fb-8473-4cfd-8e01-f1182afcbd6f', '276d436d-6a8f-42ee-864f-480d564a95e5') AND status = 'active';  -- 기대 0
