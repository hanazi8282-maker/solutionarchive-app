-- target-revive 롤백 20261021T205100 — 7행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('fdcb7237-1c7d-4808-9629-032d61be22e7'::uuid, 'exhausted', 1),
  ('42a5bf9f-f953-48ec-9683-e278cb68bc0f'::uuid, 'exhausted', 0),
  ('65521e7f-5291-4268-bd28-a75de5e1fa69'::uuid, 'exhausted', 1),
  ('263e809e-41bc-47cb-8964-a3bbd97597a5'::uuid, 'exhausted', 1),
  ('80c69591-84c6-4b79-bff6-b5f5853468a6'::uuid, 'exhausted', 1),
  ('c204de12-ca59-4dc2-9161-8dd8708da470'::uuid, 'exhausted', 1),
  ('7e132bd9-5b99-4c70-af44-25cfe8c92865'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('fdcb7237-1c7d-4808-9629-032d61be22e7', '42a5bf9f-f953-48ec-9683-e278cb68bc0f', '65521e7f-5291-4268-bd28-a75de5e1fa69', '263e809e-41bc-47cb-8964-a3bbd97597a5', '80c69591-84c6-4b79-bff6-b5f5853468a6', 'c204de12-ca59-4dc2-9161-8dd8708da470', '7e132bd9-5b99-4c70-af44-25cfe8c92865') AND status = 'active';  -- 기대 0
