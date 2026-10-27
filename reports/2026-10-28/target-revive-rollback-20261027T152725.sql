-- target-revive 롤백 20261027T152725 — 7행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('b0bf5e4a-4939-44ec-b2ce-b876904193e7'::uuid, 'exhausted', 1),
  ('f4ea7345-d367-452a-ad27-691c03a3fc68'::uuid, 'exhausted', 1),
  ('8184fd98-dfd1-4cad-8f8e-824b21b21880'::uuid, 'exhausted', 0),
  ('90a46620-76c5-4b0d-a793-f029cc5e2713'::uuid, 'exhausted', 1),
  ('30e3f9c2-71e4-4283-8c2d-8819a076683f'::uuid, 'exhausted', 1),
  ('ebfdf888-ae28-4c83-9c26-6cc24356b6ca'::uuid, 'exhausted', 1),
  ('7e132bd9-5b99-4c70-af44-25cfe8c92865'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('b0bf5e4a-4939-44ec-b2ce-b876904193e7', 'f4ea7345-d367-452a-ad27-691c03a3fc68', '8184fd98-dfd1-4cad-8f8e-824b21b21880', '90a46620-76c5-4b0d-a793-f029cc5e2713', '30e3f9c2-71e4-4283-8c2d-8819a076683f', 'ebfdf888-ae28-4c83-9c26-6cc24356b6ca', '7e132bd9-5b99-4c70-af44-25cfe8c92865') AND status = 'active';  -- 기대 0
