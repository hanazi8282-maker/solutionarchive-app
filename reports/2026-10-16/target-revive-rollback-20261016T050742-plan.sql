-- target-revive 롤백 20261016T050742 — 5행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('3040452b-fe4f-4084-b59b-2720fa744613'::uuid, 'exhausted', 3),
  ('729cce7a-cdf8-414e-8d40-821a91705618'::uuid, 'exhausted', 3),
  ('4f8c12ba-5a44-4c10-bb4f-3816fd695a49'::uuid, 'exhausted', 3),
  ('6ef8c5f6-d462-4455-a7b8-09621fad5925'::uuid, 'exhausted', 3),
  ('60b0a0d0-6003-462e-acfa-67d095f4af28'::uuid, 'exhausted', 3)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('3040452b-fe4f-4084-b59b-2720fa744613', '729cce7a-cdf8-414e-8d40-821a91705618', '4f8c12ba-5a44-4c10-bb4f-3816fd695a49', '6ef8c5f6-d462-4455-a7b8-09621fad5925', '60b0a0d0-6003-462e-acfa-67d095f4af28') AND status = 'active';  -- 기대 0
