-- target-revive 롤백 20261018T132341 — 2행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('035802fa-007a-4aa6-8c6f-f628ac36a68c'::uuid, 'exhausted', 3),
  ('ac926c78-6da2-4eec-af1e-9d307433f936'::uuid, 'exhausted', 3)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('035802fa-007a-4aa6-8c6f-f628ac36a68c', 'ac926c78-6da2-4eec-af1e-9d307433f936') AND status = 'active';  -- 기대 0
