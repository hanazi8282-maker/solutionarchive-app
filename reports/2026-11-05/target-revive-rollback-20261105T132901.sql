-- target-revive 롤백 20261105T132901 — 2행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('5d89ed0d-c0d7-4b85-b28f-69eeec99ebff'::uuid, 'exhausted', 3),
  ('848cde21-913c-4ed4-8ddd-ee7f1813cae2'::uuid, 'exhausted', 3)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('5d89ed0d-c0d7-4b85-b28f-69eeec99ebff', '848cde21-913c-4ed4-8ddd-ee7f1813cae2') AND status = 'active';  -- 기대 0
