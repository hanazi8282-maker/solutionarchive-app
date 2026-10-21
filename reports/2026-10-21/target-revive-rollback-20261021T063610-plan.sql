-- target-revive 롤백 20261021T063610 — 3행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('23954f13-2894-4089-9fd2-00e5f11b1b0b'::uuid, 'exhausted', 0),
  ('29c3fc9c-f7a2-4fe4-b095-7401552a9650'::uuid, 'exhausted', 3),
  ('c6875e78-1706-4e7f-b102-0c2c6d771886'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('23954f13-2894-4089-9fd2-00e5f11b1b0b', '29c3fc9c-f7a2-4fe4-b095-7401552a9650', 'c6875e78-1706-4e7f-b102-0c2c6d771886') AND status = 'active';  -- 기대 0
