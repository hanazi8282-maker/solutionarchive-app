-- target-revive 롤백 20261018T043743 — 2행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('bc17f752-3875-4678-ba31-172672d7e98b'::uuid, 'exhausted', 3),
  ('070b7bb2-2828-41f9-9f2f-28969105db96'::uuid, 'exhausted', 3)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('bc17f752-3875-4678-ba31-172672d7e98b', '070b7bb2-2828-41f9-9f2f-28969105db96') AND status = 'active';  -- 기대 0
