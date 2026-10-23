-- target-revive 롤백 20261023T063111 — 6행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('0fc6f295-cdea-40a3-8e0a-7d4ea51031fc'::uuid, 'exhausted', 0),
  ('b8c882ce-f01c-48d1-aba5-a116711a856f'::uuid, 'exhausted', 0),
  ('7c73fd7f-d2c8-4485-8ad6-e118a15f95ba'::uuid, 'exhausted', 0),
  ('908bfd7f-242e-498c-92b9-9cd18dbd9837'::uuid, 'exhausted', 0),
  ('82f3a55a-f3ca-4703-baf9-bd1f635469a3'::uuid, 'exhausted', 0),
  ('d097ddfc-a59b-4525-8475-f803c6bff6da'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('0fc6f295-cdea-40a3-8e0a-7d4ea51031fc', 'b8c882ce-f01c-48d1-aba5-a116711a856f', '7c73fd7f-d2c8-4485-8ad6-e118a15f95ba', '908bfd7f-242e-498c-92b9-9cd18dbd9837', '82f3a55a-f3ca-4703-baf9-bd1f635469a3', 'd097ddfc-a59b-4525-8475-f803c6bff6da') AND status = 'active';  -- 기대 0
