-- target-revive 롤백 20261024T224504 — 2행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('b02213be-da26-4ff3-97b3-348f86c9efb0'::uuid, 'exhausted', 0),
  ('baf9bafc-0de5-498f-b257-fd0b619087c6'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('b02213be-da26-4ff3-97b3-348f86c9efb0', 'baf9bafc-0de5-498f-b257-fd0b619087c6') AND status = 'active';  -- 기대 0
