-- target-revive 롤백 20261108T212031 — 5행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('d097ddfc-a59b-4525-8475-f803c6bff6da'::uuid, 'exhausted', 1),
  ('ea516666-a494-4ec4-b56c-276486898f55'::uuid, 'exhausted', 2),
  ('c90f10a3-b0f0-4b61-83fd-2d10cd7fec4b'::uuid, 'exhausted', 1),
  ('4cfc57a3-befc-4b9e-951d-0840fc26ef38'::uuid, 'exhausted', 2),
  ('8fe2db70-df18-492e-9e89-ded9674ef8dc'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('d097ddfc-a59b-4525-8475-f803c6bff6da', 'ea516666-a494-4ec4-b56c-276486898f55', 'c90f10a3-b0f0-4b61-83fd-2d10cd7fec4b', '4cfc57a3-befc-4b9e-951d-0840fc26ef38', '8fe2db70-df18-492e-9e89-ded9674ef8dc') AND status = 'active';  -- 기대 0
