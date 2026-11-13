-- target-revive 롤백 20261112T205452 — 7행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('8184fd98-dfd1-4cad-8f8e-824b21b21880'::uuid, 'exhausted', 0),
  ('90a46620-76c5-4b0d-a793-f029cc5e2713'::uuid, 'exhausted', 0),
  ('30e3f9c2-71e4-4283-8c2d-8819a076683f'::uuid, 'exhausted', 0),
  ('ebfdf888-ae28-4c83-9c26-6cc24356b6ca'::uuid, 'exhausted', 0),
  ('d460e358-1501-4d26-a0bc-7e5ba0549711'::uuid, 'exhausted', 0),
  ('a5d2139a-561c-4f0f-844e-960e0c63d424'::uuid, 'exhausted', 0),
  ('a42ead18-426a-4c58-8525-764934d3b109'::uuid, 'exhausted', 3)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('8184fd98-dfd1-4cad-8f8e-824b21b21880', '90a46620-76c5-4b0d-a793-f029cc5e2713', '30e3f9c2-71e4-4283-8c2d-8819a076683f', 'ebfdf888-ae28-4c83-9c26-6cc24356b6ca', 'd460e358-1501-4d26-a0bc-7e5ba0549711', 'a5d2139a-561c-4f0f-844e-960e0c63d424', 'a42ead18-426a-4c58-8525-764934d3b109') AND status = 'active';  -- 기대 0
