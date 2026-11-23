-- target-revive 롤백 20261123T010936 — 2행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('8a6aa624-3877-4f3d-8b74-a89a817c4375'::uuid, 'exhausted', 30),
  ('ce4fad76-3241-45c0-885c-8e8fd26ceeb7'::uuid, 'exhausted', 3)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('8a6aa624-3877-4f3d-8b74-a89a817c4375', 'ce4fad76-3241-45c0-885c-8e8fd26ceeb7') AND status = 'active';  -- 기대 0
