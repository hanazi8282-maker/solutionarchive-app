-- target-revive 롤백 20261105T063814 — 7행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('d487cb94-643b-42a6-b1cc-f8594e3edee8'::uuid, 'exhausted', 1),
  ('bdd1dce0-d59e-49ba-ada8-adeea4272ac9'::uuid, 'exhausted', 1),
  ('fc240947-cc2e-4d52-b58c-9139ed2138ab'::uuid, 'exhausted', 1),
  ('62726b81-b49b-4786-90a2-1cc6722b5b09'::uuid, 'exhausted', 1),
  ('551d564d-435b-436a-ba6c-2c5902a934e3'::uuid, 'exhausted', 1),
  ('c3b1d038-5a2f-43c2-be66-cb2f44e75c19'::uuid, 'exhausted', 3),
  ('2d32a1a5-3d47-4f72-9cfa-f060912542c5'::uuid, 'exhausted', 3)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('d487cb94-643b-42a6-b1cc-f8594e3edee8', 'bdd1dce0-d59e-49ba-ada8-adeea4272ac9', 'fc240947-cc2e-4d52-b58c-9139ed2138ab', '62726b81-b49b-4786-90a2-1cc6722b5b09', '551d564d-435b-436a-ba6c-2c5902a934e3', 'c3b1d038-5a2f-43c2-be66-cb2f44e75c19', '2d32a1a5-3d47-4f72-9cfa-f060912542c5') AND status = 'active';  -- 기대 0
