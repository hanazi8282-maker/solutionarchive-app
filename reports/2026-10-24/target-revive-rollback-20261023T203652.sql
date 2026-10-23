-- target-revive 롤백 20261023T203652 — 4행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('2d32a1a5-3d47-4f72-9cfa-f060912542c5'::uuid, 'exhausted', 3),
  ('ce4fad76-3241-45c0-885c-8e8fd26ceeb7'::uuid, 'exhausted', 3),
  ('4fb66fbf-5e87-4411-af47-511af3155218'::uuid, 'exhausted', 3),
  ('340b9f95-5138-4b41-9456-b3549ac3407a'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('2d32a1a5-3d47-4f72-9cfa-f060912542c5', 'ce4fad76-3241-45c0-885c-8e8fd26ceeb7', '4fb66fbf-5e87-4411-af47-511af3155218', '340b9f95-5138-4b41-9456-b3549ac3407a') AND status = 'active';  -- 기대 0
