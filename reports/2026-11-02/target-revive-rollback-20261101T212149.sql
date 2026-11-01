-- target-revive 롤백 20261101T212149 — 7행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('deda7247-0d84-453f-ade6-c31fe88f17ff'::uuid, 'exhausted', 0),
  ('17a5f476-131b-4d03-823f-5b6a18d89653'::uuid, 'exhausted', 1),
  ('e1dd548f-0ac8-4ec1-b78b-600ce1ba5daf'::uuid, 'exhausted', 1),
  ('04cbca92-05d4-4da0-b07d-9ea7dda94df1'::uuid, 'exhausted', 1),
  ('0d41f9af-1120-4bd0-88e9-f46acf187a33'::uuid, 'exhausted', 1),
  ('e84178c3-0296-485b-bb31-3658fa56e88f'::uuid, 'exhausted', 1),
  ('8a88f64f-71c8-4cd0-a5d8-9b5f6de023e7'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('deda7247-0d84-453f-ade6-c31fe88f17ff', '17a5f476-131b-4d03-823f-5b6a18d89653', 'e1dd548f-0ac8-4ec1-b78b-600ce1ba5daf', '04cbca92-05d4-4da0-b07d-9ea7dda94df1', '0d41f9af-1120-4bd0-88e9-f46acf187a33', 'e84178c3-0296-485b-bb31-3658fa56e88f', '8a88f64f-71c8-4cd0-a5d8-9b5f6de023e7') AND status = 'active';  -- 기대 0
