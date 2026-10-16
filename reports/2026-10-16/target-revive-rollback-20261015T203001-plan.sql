-- target-revive 롤백 20261015T203001 — 2행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('5d318405-12ad-4592-9c1a-dceb9b6c67fd'::uuid, 'exhausted', 3),
  ('f24be87a-de8a-407b-b2f0-fe75470101e8'::uuid, 'exhausted', 3)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('5d318405-12ad-4592-9c1a-dceb9b6c67fd', 'f24be87a-de8a-407b-b2f0-fe75470101e8') AND status = 'active';  -- 기대 0
