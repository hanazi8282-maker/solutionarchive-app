-- target-revive 롤백 20261102T053814 — 13행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('121c39df-40b5-4b2e-881b-b08f0467f248'::uuid, 'exhausted', 0),
  ('b5c05224-d9f1-49a3-9299-3f73d5314c16'::uuid, 'exhausted', 0),
  ('c4028ed8-b821-4954-8f6f-e7e2d5ad02fe'::uuid, 'exhausted', 0),
  ('0f95526b-34fe-4e27-bc33-09237a725826'::uuid, 'exhausted', 0),
  ('eb0ab296-6a76-48a1-85c1-c714719634b9'::uuid, 'exhausted', 0),
  ('ae45b7fb-1311-42ae-91bb-13187538b891'::uuid, 'exhausted', 0),
  ('02d11d30-2ef9-4339-a51e-34a7c3d8924b'::uuid, 'exhausted', 3),
  ('dfd23d2e-63ea-4e6c-8ce3-9513cf5676dd'::uuid, 'exhausted', 1),
  ('36ec9b41-c5c8-42f9-9c58-f6ce5776cdd6'::uuid, 'exhausted', 2),
  ('55ebf8aa-a3c7-4467-b238-edcf878e00c2'::uuid, 'exhausted', 2),
  ('23954f13-2894-4089-9fd2-00e5f11b1b0b'::uuid, 'exhausted', 1),
  ('c6875e78-1706-4e7f-b102-0c2c6d771886'::uuid, 'exhausted', 1),
  ('2494b427-bb16-44f7-99d5-81f71b6a9d52'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('121c39df-40b5-4b2e-881b-b08f0467f248', 'b5c05224-d9f1-49a3-9299-3f73d5314c16', 'c4028ed8-b821-4954-8f6f-e7e2d5ad02fe', '0f95526b-34fe-4e27-bc33-09237a725826', 'eb0ab296-6a76-48a1-85c1-c714719634b9', 'ae45b7fb-1311-42ae-91bb-13187538b891', '02d11d30-2ef9-4339-a51e-34a7c3d8924b', 'dfd23d2e-63ea-4e6c-8ce3-9513cf5676dd', '36ec9b41-c5c8-42f9-9c58-f6ce5776cdd6', '55ebf8aa-a3c7-4467-b238-edcf878e00c2', '23954f13-2894-4089-9fd2-00e5f11b1b0b', 'c6875e78-1706-4e7f-b102-0c2c6d771886', '2494b427-bb16-44f7-99d5-81f71b6a9d52') AND status = 'active';  -- 기대 0
