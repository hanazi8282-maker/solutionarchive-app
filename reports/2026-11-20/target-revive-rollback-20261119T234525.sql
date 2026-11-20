-- target-revive 롤백 20261119T234525 — 2행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('848cde21-913c-4ed4-8ddd-ee7f1813cae2'::uuid, 'exhausted', 4),
  ('2d32a1a5-3d47-4f72-9cfa-f060912542c5'::uuid, 'exhausted', 3)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('848cde21-913c-4ed4-8ddd-ee7f1813cae2', '2d32a1a5-3d47-4f72-9cfa-f060912542c5') AND status = 'active';  -- 기대 0
