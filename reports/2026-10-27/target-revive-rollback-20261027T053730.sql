-- target-revive 롤백 20261027T053730 — 6행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('56661660-99fc-46c9-afd3-a9dc33ce1f60'::uuid, 'exhausted', 0),
  ('e5bc8769-c037-41ba-971f-7df7df2e9695'::uuid, 'exhausted', 0),
  ('04e52811-e914-4396-a7ad-8021f35e0e6a'::uuid, 'exhausted', 0),
  ('c7308310-52de-43b7-868b-878133b15e12'::uuid, 'exhausted', 0),
  ('d789eda9-3c27-49ed-b5b7-60c8d5b1491d'::uuid, 'exhausted', 0),
  ('f0be74e9-a5fd-471b-a33b-df31803b7625'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('56661660-99fc-46c9-afd3-a9dc33ce1f60', 'e5bc8769-c037-41ba-971f-7df7df2e9695', '04e52811-e914-4396-a7ad-8021f35e0e6a', 'c7308310-52de-43b7-868b-878133b15e12', 'd789eda9-3c27-49ed-b5b7-60c8d5b1491d', 'f0be74e9-a5fd-471b-a33b-df31803b7625') AND status = 'active';  -- 기대 0
