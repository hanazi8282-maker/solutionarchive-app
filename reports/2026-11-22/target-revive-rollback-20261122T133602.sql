-- target-revive 롤백 20261122T133602 — 3행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('32b133d9-b3f4-45da-acc6-0741342b994d'::uuid, 'exhausted', 4),
  ('fb48b445-fa7f-4e61-9db6-a7c6d27bc7d5'::uuid, 'exhausted', 4),
  ('d4263d18-9696-462a-aa3e-6b06db9f6a5d'::uuid, 'exhausted', 3)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('32b133d9-b3f4-45da-acc6-0741342b994d', 'fb48b445-fa7f-4e61-9db6-a7c6d27bc7d5', 'd4263d18-9696-462a-aa3e-6b06db9f6a5d') AND status = 'active';  -- 기대 0
