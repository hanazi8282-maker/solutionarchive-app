-- target-revive 롤백 20261104T005652 — 6행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('8a6aa624-3877-4f3d-8b74-a89a817c4375'::uuid, 'exhausted', 30),
  ('b043385e-5d1f-49bd-8236-124a7362824c'::uuid, 'exhausted', 1),
  ('2cb6d583-8a7f-47b1-913b-8c945bcab34e'::uuid, 'exhausted', 1),
  ('db98c569-a741-41ff-912d-db78caf1f03c'::uuid, 'exhausted', 1),
  ('a61c96e4-9c92-40ab-a955-4109efb465b6'::uuid, 'exhausted', 1),
  ('2a6d43c9-b474-4663-a3fc-1e4cd0a5923c'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('8a6aa624-3877-4f3d-8b74-a89a817c4375', 'b043385e-5d1f-49bd-8236-124a7362824c', '2cb6d583-8a7f-47b1-913b-8c945bcab34e', 'db98c569-a741-41ff-912d-db78caf1f03c', 'a61c96e4-9c92-40ab-a955-4109efb465b6', '2a6d43c9-b474-4663-a3fc-1e4cd0a5923c') AND status = 'active';  -- 기대 0
