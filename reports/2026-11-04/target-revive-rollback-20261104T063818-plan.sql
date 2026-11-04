-- target-revive 롤백 20261104T063818 — 8행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('c999430c-7a5b-437a-9043-c7e310fa4317'::uuid, 'exhausted', 3),
  ('6c295c44-0697-4a1c-917d-796339a8622a'::uuid, 'exhausted', 1),
  ('d487cb94-643b-42a6-b1cc-f8594e3edee8'::uuid, 'exhausted', 1),
  ('bdd1dce0-d59e-49ba-ada8-adeea4272ac9'::uuid, 'exhausted', 1),
  ('fc240947-cc2e-4d52-b58c-9139ed2138ab'::uuid, 'exhausted', 1),
  ('62726b81-b49b-4786-90a2-1cc6722b5b09'::uuid, 'exhausted', 1),
  ('551d564d-435b-436a-ba6c-2c5902a934e3'::uuid, 'exhausted', 1),
  ('3ee0f078-d052-43db-a51a-df8bca20e4dd'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('c999430c-7a5b-437a-9043-c7e310fa4317', '6c295c44-0697-4a1c-917d-796339a8622a', 'd487cb94-643b-42a6-b1cc-f8594e3edee8', 'bdd1dce0-d59e-49ba-ada8-adeea4272ac9', 'fc240947-cc2e-4d52-b58c-9139ed2138ab', '62726b81-b49b-4786-90a2-1cc6722b5b09', '551d564d-435b-436a-ba6c-2c5902a934e3', '3ee0f078-d052-43db-a51a-df8bca20e4dd') AND status = 'active';  -- 기대 0
