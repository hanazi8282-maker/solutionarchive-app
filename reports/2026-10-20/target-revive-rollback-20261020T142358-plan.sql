-- target-revive 롤백 20261020T142358 — 6행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('6171147e-7ce9-4ce8-90b9-6efee8a5ff44'::uuid, 'exhausted', 1),
  ('a034084b-4e31-445a-9f4c-d7b1568c28cc'::uuid, 'exhausted', 0),
  ('a03d42b8-bd1c-4609-904a-308a4afb3403'::uuid, 'exhausted', 1),
  ('fd75779f-d0b2-423d-abe2-db34f7a110a1'::uuid, 'exhausted', 1),
  ('c8c4c905-15c1-4944-94d6-9e87c55bc6bb'::uuid, 'exhausted', 0),
  ('edce8b2b-e69a-405e-a13b-c40ab69c2f7c'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('6171147e-7ce9-4ce8-90b9-6efee8a5ff44', 'a034084b-4e31-445a-9f4c-d7b1568c28cc', 'a03d42b8-bd1c-4609-904a-308a4afb3403', 'fd75779f-d0b2-423d-abe2-db34f7a110a1', 'c8c4c905-15c1-4944-94d6-9e87c55bc6bb', 'edce8b2b-e69a-405e-a13b-c40ab69c2f7c') AND status = 'active';  -- 기대 0
