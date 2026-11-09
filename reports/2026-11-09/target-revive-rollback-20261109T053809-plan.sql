-- target-revive 롤백 20261109T053809 — 11행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('4d3b3431-59db-4e66-8f0a-ad2da73f7e07'::uuid, 'exhausted', 30),
  ('7b9551aa-ef6e-4849-a603-01d3676c47e0'::uuid, 'exhausted', 0),
  ('1ebe8733-2e5d-49e4-9cb3-b8e1b94222c4'::uuid, 'exhausted', 0),
  ('f9ad591c-5e29-46b4-ba39-6b76aea50695'::uuid, 'exhausted', 0),
  ('f16dfccc-7be1-46f8-9938-2f6e6aa4a1f9'::uuid, 'exhausted', 0),
  ('37f053ad-9fa0-43d7-9d88-4869bc5324b1'::uuid, 'exhausted', 3),
  ('fde8e59a-9758-429f-9d4d-ef0fd69dd6a5'::uuid, 'exhausted', 2),
  ('be3adba5-e5ad-4347-b045-8b803afd4848'::uuid, 'exhausted', 2),
  ('c0936de6-6acb-4a3a-9f3e-6ceb8386ef39'::uuid, 'exhausted', 2),
  ('b159162e-01a1-4bb5-8dc4-07d4ec0e8862'::uuid, 'exhausted', 0),
  ('9dea328c-0530-41d7-9249-f5ceb57d512a'::uuid, 'exhausted', 2)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('4d3b3431-59db-4e66-8f0a-ad2da73f7e07', '7b9551aa-ef6e-4849-a603-01d3676c47e0', '1ebe8733-2e5d-49e4-9cb3-b8e1b94222c4', 'f9ad591c-5e29-46b4-ba39-6b76aea50695', 'f16dfccc-7be1-46f8-9938-2f6e6aa4a1f9', '37f053ad-9fa0-43d7-9d88-4869bc5324b1', 'fde8e59a-9758-429f-9d4d-ef0fd69dd6a5', 'be3adba5-e5ad-4347-b045-8b803afd4848', 'c0936de6-6acb-4a3a-9f3e-6ceb8386ef39', 'b159162e-01a1-4bb5-8dc4-07d4ec0e8862', '9dea328c-0530-41d7-9249-f5ceb57d512a') AND status = 'active';  -- 기대 0
