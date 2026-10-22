-- target-revive 롤백 20261022T143530 — 7행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('e494487e-958f-4128-921c-c3c76efddfa3'::uuid, 'exhausted', 0),
  ('19acd977-1dd2-44c4-885c-46d393ab08d1'::uuid, 'exhausted', 0),
  ('0761ed52-5517-4560-93c5-0a62a511148c'::uuid, 'exhausted', 0),
  ('13c1551c-ade6-4fd4-8443-222aa1c02c27'::uuid, 'exhausted', 0),
  ('fa90d340-0631-46b1-9a01-c7fe8916430f'::uuid, 'exhausted', 0),
  ('0319d18e-9ace-471a-b823-e74001734e28'::uuid, 'exhausted', 1),
  ('37f053ad-9fa0-43d7-9d88-4869bc5324b1'::uuid, 'exhausted', 3)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('e494487e-958f-4128-921c-c3c76efddfa3', '19acd977-1dd2-44c4-885c-46d393ab08d1', '0761ed52-5517-4560-93c5-0a62a511148c', '13c1551c-ade6-4fd4-8443-222aa1c02c27', 'fa90d340-0631-46b1-9a01-c7fe8916430f', '0319d18e-9ace-471a-b823-e74001734e28', '37f053ad-9fa0-43d7-9d88-4869bc5324b1') AND status = 'active';  -- 기대 0
