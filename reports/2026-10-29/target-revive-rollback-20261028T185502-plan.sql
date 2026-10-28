-- target-revive 롤백 20261028T185502 — 6행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('38e14300-67a1-48d1-a4c6-37495ed15ca2'::uuid, 'exhausted', 0),
  ('486d317d-2f4b-4ca6-b4ac-fce2134b556e'::uuid, 'exhausted', 0),
  ('acacca93-23ff-48f9-848b-3666c827d7fb'::uuid, 'exhausted', 0),
  ('a62388ae-720d-44c7-8aaf-be918b39bc72'::uuid, 'exhausted', 0),
  ('9ddc4aec-7778-4bdb-9947-f344ee3bf9ea'::uuid, 'exhausted', 0),
  ('34311a9a-1364-40ac-be1a-767ccb0a5834'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('38e14300-67a1-48d1-a4c6-37495ed15ca2', '486d317d-2f4b-4ca6-b4ac-fce2134b556e', 'acacca93-23ff-48f9-848b-3666c827d7fb', 'a62388ae-720d-44c7-8aaf-be918b39bc72', '9ddc4aec-7778-4bdb-9947-f344ee3bf9ea', '34311a9a-1364-40ac-be1a-767ccb0a5834') AND status = 'active';  -- 기대 0
