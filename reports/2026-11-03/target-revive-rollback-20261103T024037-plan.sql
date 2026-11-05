-- target-revive 롤백 20261103T024037 — 6행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('3138f0ea-78ea-45a5-ad97-8c10f02f3044'::uuid, 'exhausted', 1),
  ('549272a0-c5d5-4d32-844c-5373b7ae9774'::uuid, 'exhausted', 1),
  ('fd2b7783-16cb-4dfa-b0ca-af953652a894'::uuid, 'exhausted', 1),
  ('388148e3-5e44-4e35-98aa-c8b97f5b93bb'::uuid, 'exhausted', 1),
  ('c68855b3-afe6-4df1-92bc-8d6869de3403'::uuid, 'exhausted', 1),
  ('8aca9640-1423-4cc7-a0a1-cfe36d8b9ca2'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('3138f0ea-78ea-45a5-ad97-8c10f02f3044', '549272a0-c5d5-4d32-844c-5373b7ae9774', 'fd2b7783-16cb-4dfa-b0ca-af953652a894', '388148e3-5e44-4e35-98aa-c8b97f5b93bb', 'c68855b3-afe6-4df1-92bc-8d6869de3403', '8aca9640-1423-4cc7-a0a1-cfe36d8b9ca2') AND status = 'active';  -- 기대 0
