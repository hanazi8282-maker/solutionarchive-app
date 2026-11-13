-- target-revive 롤백 20261112T073821 — 8행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('f5b3a078-fb65-4423-aea7-7bb7e6ac3c9c'::uuid, 'exhausted', 4),
  ('b94c5193-d9a4-4023-aa6e-02af3a6af8eb'::uuid, 'exhausted', 1),
  ('fa745a26-cb46-4d40-9abe-d9842ddc5527'::uuid, 'exhausted', 1),
  ('56661660-99fc-46c9-afd3-a9dc33ce1f60'::uuid, 'exhausted', 1),
  ('e5bc8769-c037-41ba-971f-7df7df2e9695'::uuid, 'exhausted', 1),
  ('04e52811-e914-4396-a7ad-8021f35e0e6a'::uuid, 'exhausted', 1),
  ('c7308310-52de-43b7-868b-878133b15e12'::uuid, 'exhausted', 1),
  ('759f6661-5bad-43b4-a1cc-f69632b80bc8'::uuid, 'exhausted', 2)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('f5b3a078-fb65-4423-aea7-7bb7e6ac3c9c', 'b94c5193-d9a4-4023-aa6e-02af3a6af8eb', 'fa745a26-cb46-4d40-9abe-d9842ddc5527', '56661660-99fc-46c9-afd3-a9dc33ce1f60', 'e5bc8769-c037-41ba-971f-7df7df2e9695', '04e52811-e914-4396-a7ad-8021f35e0e6a', 'c7308310-52de-43b7-868b-878133b15e12', '759f6661-5bad-43b4-a1cc-f69632b80bc8') AND status = 'active';  -- 기대 0
