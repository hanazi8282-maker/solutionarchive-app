-- target-revive 롤백 20261025T065506 — 2행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('67c2bc26-0ee6-46a8-b39b-92192546fbc6'::uuid, 'exhausted', 3),
  ('fb48b445-fa7f-4e61-9db6-a7c6d27bc7d5'::uuid, 'exhausted', 3)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('67c2bc26-0ee6-46a8-b39b-92192546fbc6', 'fb48b445-fa7f-4e61-9db6-a7c6d27bc7d5') AND status = 'active';  -- 기대 0
