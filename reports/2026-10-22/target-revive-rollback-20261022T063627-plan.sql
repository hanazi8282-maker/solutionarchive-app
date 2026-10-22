-- target-revive 롤백 20261022T063627 — 6행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('c13cc476-68c4-4769-ae23-f26b18ea9a5d'::uuid, 'exhausted', 1),
  ('0733a1f6-1e3d-4444-937c-aa2df08d609b'::uuid, 'exhausted', 0),
  ('4a93b57a-59b9-4d36-9dc9-19c68bf268a9'::uuid, 'exhausted', 1),
  ('6d740cb0-6985-4c6e-840e-def87ebe73b3'::uuid, 'exhausted', 1),
  ('8053971a-d726-4617-9299-e1ffa4f30393'::uuid, 'exhausted', 1),
  ('0badd13d-d351-4990-aa17-d6261db70694'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('c13cc476-68c4-4769-ae23-f26b18ea9a5d', '0733a1f6-1e3d-4444-937c-aa2df08d609b', '4a93b57a-59b9-4d36-9dc9-19c68bf268a9', '6d740cb0-6985-4c6e-840e-def87ebe73b3', '8053971a-d726-4617-9299-e1ffa4f30393', '0badd13d-d351-4990-aa17-d6261db70694') AND status = 'active';  -- 기대 0
