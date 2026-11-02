-- target-revive 롤백 20261102T200515 — 2행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('42a5bf9f-f953-48ec-9683-e278cb68bc0f'::uuid, 'exhausted', 1),
  ('65521e7f-5291-4268-bd28-a75de5e1fa69'::uuid, 'exhausted', 2)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('42a5bf9f-f953-48ec-9683-e278cb68bc0f', '65521e7f-5291-4268-bd28-a75de5e1fa69') AND status = 'active';  -- 기대 0
