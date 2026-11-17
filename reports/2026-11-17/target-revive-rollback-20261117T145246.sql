-- target-revive 롤백 20261117T145246 — 3행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('4e26b9bc-862c-4d98-8a20-9310b889778e'::uuid, 'exhausted', 2),
  ('0fd56b00-0383-45d3-9d76-c32b2948826b'::uuid, 'exhausted', 2),
  ('7f1ca6ac-885a-4b6f-9d60-76852f1bd8fc'::uuid, 'exhausted', 2)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('4e26b9bc-862c-4d98-8a20-9310b889778e', '0fd56b00-0383-45d3-9d76-c32b2948826b', '7f1ca6ac-885a-4b6f-9d60-76852f1bd8fc') AND status = 'active';  -- 기대 0
