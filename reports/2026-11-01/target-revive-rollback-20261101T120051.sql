-- target-revive 롤백 20261101T120051 — 7행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('e685b67f-252e-4654-a677-8be9cf943fbe'::uuid, 'exhausted', 3),
  ('77c852d7-0472-4eab-9e79-da13415540be'::uuid, 'exhausted', 1),
  ('39295b97-40e0-4575-ad12-5250f8ae90e6'::uuid, 'exhausted', 1),
  ('c57d8f51-8152-4a71-8691-3de9342ee482'::uuid, 'exhausted', 1),
  ('f726026b-82f3-46e3-9e88-258eff41e376'::uuid, 'exhausted', 1),
  ('e6e176cf-f15f-4e19-b92d-2fa6e6a83564'::uuid, 'exhausted', 1),
  ('bda85d12-4640-4fe8-b7a2-a1f98c83ee9a'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('e685b67f-252e-4654-a677-8be9cf943fbe', '77c852d7-0472-4eab-9e79-da13415540be', '39295b97-40e0-4575-ad12-5250f8ae90e6', 'c57d8f51-8152-4a71-8691-3de9342ee482', 'f726026b-82f3-46e3-9e88-258eff41e376', 'e6e176cf-f15f-4e19-b92d-2fa6e6a83564', 'bda85d12-4640-4fe8-b7a2-a1f98c83ee9a') AND status = 'active';  -- 기대 0
