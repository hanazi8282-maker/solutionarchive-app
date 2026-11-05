-- target-revive 롤백 20261105T083225 — 5행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('3ff1a17b-e3c4-4e37-91db-e928aeb3b4a0'::uuid, 'exhausted', 1),
  ('7ebddc51-ce96-40a7-bd6f-1ef61acd4c63'::uuid, 'exhausted', 1),
  ('76528c12-38b5-4635-a8fc-ad43dd2269a5'::uuid, 'exhausted', 1),
  ('ebe67470-96f2-41ca-8e3b-740ecee90862'::uuid, 'exhausted', 2),
  ('c4bfa9f5-60da-49bc-ad8e-c4598ec1f797'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('3ff1a17b-e3c4-4e37-91db-e928aeb3b4a0', '7ebddc51-ce96-40a7-bd6f-1ef61acd4c63', '76528c12-38b5-4635-a8fc-ad43dd2269a5', 'ebe67470-96f2-41ca-8e3b-740ecee90862', 'c4bfa9f5-60da-49bc-ad8e-c4598ec1f797') AND status = 'active';  -- 기대 0
