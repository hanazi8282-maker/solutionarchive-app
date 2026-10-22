-- target-revive 롤백 20261022T053742 — 2행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('ccf6cf5e-33b7-4c44-8962-edab3365ba63'::uuid, 'exhausted', 3),
  ('a93386ca-6c23-4036-b490-0f1764eb6f94'::uuid, 'exhausted', 3)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('ccf6cf5e-33b7-4c44-8962-edab3365ba63', 'a93386ca-6c23-4036-b490-0f1764eb6f94') AND status = 'active';  -- 기대 0
