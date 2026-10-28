-- target-revive 롤백 20261028T053736 — 6행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('a4f4a1af-ea2b-4577-875a-cd1f5292c4e9'::uuid, 'exhausted', 1),
  ('701d8a81-d670-4e86-831e-acb7c3d67269'::uuid, 'exhausted', 1),
  ('1e92a901-740d-426e-ad16-046e4e6330e7'::uuid, 'exhausted', 1),
  ('5c44b723-2c33-4057-9190-9bc7eca6ccc9'::uuid, 'exhausted', 1),
  ('e9b7e398-278a-4e7a-8e54-c1d30c361716'::uuid, 'exhausted', 1),
  ('1abe44ac-c905-4efd-8d09-8b92b3bfbe1a'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('a4f4a1af-ea2b-4577-875a-cd1f5292c4e9', '701d8a81-d670-4e86-831e-acb7c3d67269', '1e92a901-740d-426e-ad16-046e4e6330e7', '5c44b723-2c33-4057-9190-9bc7eca6ccc9', 'e9b7e398-278a-4e7a-8e54-c1d30c361716', '1abe44ac-c905-4efd-8d09-8b92b3bfbe1a') AND status = 'active';  -- 기대 0
