-- target-revive 롤백 20261109T141922 — 3행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('28e72b40-0a88-4a2d-89dc-b876d24327ff'::uuid, 'exhausted', 4),
  ('37152bb2-b1c3-4023-96b0-f3cfd9b3597a'::uuid, 'exhausted', 4),
  ('9002d842-6f38-4d28-b4ac-0654785f76ec'::uuid, 'exhausted', 2)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('28e72b40-0a88-4a2d-89dc-b876d24327ff', '37152bb2-b1c3-4023-96b0-f3cfd9b3597a', '9002d842-6f38-4d28-b4ac-0654785f76ec') AND status = 'active';  -- 기대 0
