-- target-revive 롤백 20261021T234113 — 7행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('13c7a9a7-f5e4-4596-b5b8-3ef13651fcbf'::uuid, 'exhausted', 3),
  ('ebe67470-96f2-41ca-8e3b-740ecee90862'::uuid, 'exhausted', 1),
  ('c4bfa9f5-60da-49bc-ad8e-c4598ec1f797'::uuid, 'exhausted', 0),
  ('3f28c9d5-0f84-4123-805e-6492b197db9f'::uuid, 'exhausted', 0),
  ('ecbd38c5-8058-4e3b-821f-c5944ab62ec0'::uuid, 'exhausted', 1),
  ('5507302d-d5a1-43a6-b0ff-dd1e4bff22dd'::uuid, 'exhausted', 1),
  ('e37e653b-13e7-4ad9-8143-8fb515f2e9df'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('13c7a9a7-f5e4-4596-b5b8-3ef13651fcbf', 'ebe67470-96f2-41ca-8e3b-740ecee90862', 'c4bfa9f5-60da-49bc-ad8e-c4598ec1f797', '3f28c9d5-0f84-4123-805e-6492b197db9f', 'ecbd38c5-8058-4e3b-821f-c5944ab62ec0', '5507302d-d5a1-43a6-b0ff-dd1e4bff22dd', 'e37e653b-13e7-4ad9-8143-8fb515f2e9df') AND status = 'active';  -- 기대 0
