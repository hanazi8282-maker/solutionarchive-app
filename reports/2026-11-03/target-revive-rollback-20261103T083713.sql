-- target-revive 롤백 20261103T083713 — 5행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('c68855b3-afe6-4df1-92bc-8d6869de3403'::uuid, 'exhausted', 1),
  ('8aca9640-1423-4cc7-a0a1-cfe36d8b9ca2'::uuid, 'exhausted', 1),
  ('004b622d-0934-4c37-90bd-583010ecc4df'::uuid, 'exhausted', 1),
  ('59ec4f93-a9ea-4274-a41d-b56dd8c94a74'::uuid, 'exhausted', 1),
  ('5cd4c7fc-d9cd-4c9e-bde5-ea397dd460eb'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('c68855b3-afe6-4df1-92bc-8d6869de3403', '8aca9640-1423-4cc7-a0a1-cfe36d8b9ca2', '004b622d-0934-4c37-90bd-583010ecc4df', '59ec4f93-a9ea-4274-a41d-b56dd8c94a74', '5cd4c7fc-d9cd-4c9e-bde5-ea397dd460eb') AND status = 'active';  -- 기대 0
