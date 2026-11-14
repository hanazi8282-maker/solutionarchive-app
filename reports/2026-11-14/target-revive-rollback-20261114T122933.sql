-- target-revive 롤백 20261114T122933 — 2행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('a62388ae-720d-44c7-8aaf-be918b39bc72'::uuid, 'exhausted', 0),
  ('9ddc4aec-7778-4bdb-9947-f344ee3bf9ea'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('a62388ae-720d-44c7-8aaf-be918b39bc72', '9ddc4aec-7778-4bdb-9947-f344ee3bf9ea') AND status = 'active';  -- 기대 0
