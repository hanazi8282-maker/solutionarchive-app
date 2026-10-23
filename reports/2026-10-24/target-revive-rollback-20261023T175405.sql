-- target-revive 롤백 20261023T175405 — 2행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('37152bb2-b1c3-4023-96b0-f3cfd9b3597a'::uuid, 'exhausted', 3),
  ('143a81d3-6ab1-4d3f-8844-d13259be5cf5'::uuid, 'exhausted', 8)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('37152bb2-b1c3-4023-96b0-f3cfd9b3597a', '143a81d3-6ab1-4d3f-8844-d13259be5cf5') AND status = 'active';  -- 기대 0
