-- target-revive 롤백 20261117T235640 — 2행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('6e8631b8-8d4e-473e-9149-b97069d99e88'::uuid, 'exhausted', 3),
  ('b441ef88-271c-4049-a39b-c72482c1e9a2'::uuid, 'exhausted', 4)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('6e8631b8-8d4e-473e-9149-b97069d99e88', 'b441ef88-271c-4049-a39b-c72482c1e9a2') AND status = 'active';  -- 기대 0
