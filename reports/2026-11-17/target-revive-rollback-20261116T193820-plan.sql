-- target-revive 롤백 20261116T193820 — 3행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('c544d608-7de2-46df-96e7-829e51f4a8cf'::uuid, 'exhausted', 0),
  ('f34e1ca0-175f-451b-ad7b-15447649c975'::uuid, 'exhausted', 1),
  ('71330b7b-7c06-477f-ac4f-7f95568971cf'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('c544d608-7de2-46df-96e7-829e51f4a8cf', 'f34e1ca0-175f-451b-ad7b-15447649c975', '71330b7b-7c06-477f-ac4f-7f95568971cf') AND status = 'active';  -- 기대 0
