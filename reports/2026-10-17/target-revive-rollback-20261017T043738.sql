-- target-revive 롤백 20261017T043738 — 3행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('d390ef97-49cc-4ea1-b739-2ad712053841'::uuid, 'exhausted', 0),
  ('e3a9dcea-85b3-4b32-978c-0b59122a4f89'::uuid, 'exhausted', 3),
  ('0dbad651-6d7e-45eb-8ae7-e0dd324e792b'::uuid, 'exhausted', 3)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('d390ef97-49cc-4ea1-b739-2ad712053841', 'e3a9dcea-85b3-4b32-978c-0b59122a4f89', '0dbad651-6d7e-45eb-8ae7-e0dd324e792b') AND status = 'active';  -- 기대 0
