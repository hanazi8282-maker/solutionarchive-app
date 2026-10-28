-- target-revive 롤백 20261028T113625 — 6행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('49031fac-1125-4aee-b6bf-ead4d1fc5573'::uuid, 'exhausted', 2),
  ('0223f197-f6e2-4ea5-97db-7353e9e9b9d3'::uuid, 'exhausted', 2),
  ('67a00682-8236-4042-8ff8-78522029f2c2'::uuid, 'exhausted', 2),
  ('d15f5a06-f4cb-46ca-8ce4-a71df4e57824'::uuid, 'exhausted', 2),
  ('1ccd47ca-7e91-4e6d-8ea9-2d6d4974f1cb'::uuid, 'exhausted', 0),
  ('d40d3c29-1de4-4b05-b37b-6cf235993088'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('49031fac-1125-4aee-b6bf-ead4d1fc5573', '0223f197-f6e2-4ea5-97db-7353e9e9b9d3', '67a00682-8236-4042-8ff8-78522029f2c2', 'd15f5a06-f4cb-46ca-8ce4-a71df4e57824', '1ccd47ca-7e91-4e6d-8ea9-2d6d4974f1cb', 'd40d3c29-1de4-4b05-b37b-6cf235993088') AND status = 'active';  -- 기대 0
