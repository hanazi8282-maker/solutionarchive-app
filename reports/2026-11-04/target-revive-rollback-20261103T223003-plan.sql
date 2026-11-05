-- target-revive 롤백 20261103T223003 — 2행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('48a707d6-53fc-44e4-99af-8f698c7a29f6'::uuid, 'exhausted', 1),
  ('21a2b333-0918-4add-8913-55a67fca1239'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('48a707d6-53fc-44e4-99af-8f698c7a29f6', '21a2b333-0918-4add-8913-55a67fca1239') AND status = 'active';  -- 기대 0
