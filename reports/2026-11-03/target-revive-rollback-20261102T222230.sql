-- target-revive 롤백 20261102T222230 — 8행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('686d7129-d0ff-462f-8742-4a314a3a0185'::uuid, 'exhausted', 27),
  ('8bd5d8b0-5edd-4a42-85b1-e17556d297c3'::uuid, 'exhausted', 3),
  ('263e809e-41bc-47cb-8964-a3bbd97597a5'::uuid, 'exhausted', 2),
  ('80c69591-84c6-4b79-bff6-b5f5853468a6'::uuid, 'exhausted', 2),
  ('c204de12-ca59-4dc2-9161-8dd8708da470'::uuid, 'exhausted', 2),
  ('be293f89-9e7c-4327-82e7-c6e30a8d28a0'::uuid, 'exhausted', 1),
  ('8fcc2101-74b6-4a4a-92a7-191db4c9b017'::uuid, 'exhausted', 1),
  ('a38e1ef4-cf11-482e-9793-a20fe608382a'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('686d7129-d0ff-462f-8742-4a314a3a0185', '8bd5d8b0-5edd-4a42-85b1-e17556d297c3', '263e809e-41bc-47cb-8964-a3bbd97597a5', '80c69591-84c6-4b79-bff6-b5f5853468a6', 'c204de12-ca59-4dc2-9161-8dd8708da470', 'be293f89-9e7c-4327-82e7-c6e30a8d28a0', '8fcc2101-74b6-4a4a-92a7-191db4c9b017', 'a38e1ef4-cf11-482e-9793-a20fe608382a') AND status = 'active';  -- 기대 0
