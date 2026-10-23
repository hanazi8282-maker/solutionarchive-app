-- target-revive 롤백 20261023T102914 — 6행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('ea516666-a494-4ec4-b56c-276486898f55'::uuid, 'exhausted', 1),
  ('c90f10a3-b0f0-4b61-83fd-2d10cd7fec4b'::uuid, 'exhausted', 0),
  ('4cfc57a3-befc-4b9e-951d-0840fc26ef38'::uuid, 'exhausted', 1),
  ('9ea60984-cca2-491b-a187-2af509dc78a1'::uuid, 'exhausted', 3),
  ('8fe2db70-df18-492e-9e89-ded9674ef8dc'::uuid, 'exhausted', 0),
  ('8d4477af-21bc-43a0-bd3c-c4ea6755e4c2'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('ea516666-a494-4ec4-b56c-276486898f55', 'c90f10a3-b0f0-4b61-83fd-2d10cd7fec4b', '4cfc57a3-befc-4b9e-951d-0840fc26ef38', '9ea60984-cca2-491b-a187-2af509dc78a1', '8fe2db70-df18-492e-9e89-ded9674ef8dc', '8d4477af-21bc-43a0-bd3c-c4ea6755e4c2') AND status = 'active';  -- 기대 0
