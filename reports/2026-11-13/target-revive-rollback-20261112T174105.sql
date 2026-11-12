-- target-revive 롤백 20261112T174105 — 7행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('de0c063c-a4f2-4033-8f9c-8d4c71f09784'::uuid, 'exhausted', 0),
  ('e4c4a260-9e2a-4e57-b913-598e7916b2c9'::uuid, 'exhausted', 1),
  ('38e27902-fdd5-4d4e-8a4b-d4f91f058c53'::uuid, 'exhausted', 0),
  ('7889c6ed-54d0-4996-b6ad-3b02712743f3'::uuid, 'exhausted', 0),
  ('b0bf5e4a-4939-44ec-b2ce-b876904193e7'::uuid, 'exhausted', 0),
  ('f4ea7345-d367-452a-ad27-691c03a3fc68'::uuid, 'exhausted', 0),
  ('276d436d-6a8f-42ee-864f-480d564a95e5'::uuid, 'exhausted', 4)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('de0c063c-a4f2-4033-8f9c-8d4c71f09784', 'e4c4a260-9e2a-4e57-b913-598e7916b2c9', '38e27902-fdd5-4d4e-8a4b-d4f91f058c53', '7889c6ed-54d0-4996-b6ad-3b02712743f3', 'b0bf5e4a-4939-44ec-b2ce-b876904193e7', 'f4ea7345-d367-452a-ad27-691c03a3fc68', '276d436d-6a8f-42ee-864f-480d564a95e5') AND status = 'active';  -- 기대 0
