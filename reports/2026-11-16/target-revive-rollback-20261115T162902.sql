-- target-revive 롤백 20261115T162902 — 3행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('ace1d9ca-8694-4d20-a7b5-5e551ceb610b'::uuid, 'exhausted', 3),
  ('79509364-932a-451e-ba26-e305ad872a11'::uuid, 'exhausted', 0),
  ('1adcda6c-68cc-4d66-977f-3d798194eca7'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('ace1d9ca-8694-4d20-a7b5-5e551ceb610b', '79509364-932a-451e-ba26-e305ad872a11', '1adcda6c-68cc-4d66-977f-3d798194eca7') AND status = 'active';  -- 기대 0
