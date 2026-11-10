-- target-revive 롤백 20261110T083759 — 7행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('035802fa-007a-4aa6-8c6f-f628ac36a68c'::uuid, 'exhausted', 4),
  ('08a6ce1b-4d65-4c84-b4cf-a8c0aff2307c'::uuid, 'exhausted', 0),
  ('c5bbcfc9-45f0-4f42-af81-310a981409a7'::uuid, 'exhausted', 0),
  ('bfaed419-098e-4b2a-895d-c7429b411ee6'::uuid, 'exhausted', 0),
  ('9a13a09a-df5a-4415-be38-da6ec1404838'::uuid, 'exhausted', 0),
  ('1da9acd6-81d7-48d7-a5c1-5a5d16062f5a'::uuid, 'exhausted', 0),
  ('4dabbbc0-63b8-41f0-91ce-769cfc33d724'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('035802fa-007a-4aa6-8c6f-f628ac36a68c', '08a6ce1b-4d65-4c84-b4cf-a8c0aff2307c', 'c5bbcfc9-45f0-4f42-af81-310a981409a7', 'bfaed419-098e-4b2a-895d-c7429b411ee6', '9a13a09a-df5a-4415-be38-da6ec1404838', '1da9acd6-81d7-48d7-a5c1-5a5d16062f5a', '4dabbbc0-63b8-41f0-91ce-769cfc33d724') AND status = 'active';  -- 기대 0
