-- target-revive 롤백 20261116T060809 — 11행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('8d6a94c1-734f-4e3f-86cf-6756c7b0c2c8'::uuid, 'exhausted', 0),
  ('02a54400-7997-41a1-8e1a-e54c5836c355'::uuid, 'exhausted', 0),
  ('96ea2b52-fca1-4cb8-a002-ccb87281ebab'::uuid, 'exhausted', 0),
  ('18c5e978-ba91-4d29-abe7-c144ab5a3738'::uuid, 'exhausted', 0),
  ('cbc7bf7c-f759-4227-86f0-02cf2fbcf96e'::uuid, 'exhausted', 0),
  ('346d863e-e882-4ae8-a9e9-529251358654'::uuid, 'exhausted', 0),
  ('121c39df-40b5-4b2e-881b-b08f0467f248'::uuid, 'exhausted', 0),
  ('b5c05224-d9f1-49a3-9299-3f73d5314c16'::uuid, 'exhausted', 1),
  ('c4028ed8-b821-4954-8f6f-e7e2d5ad02fe'::uuid, 'exhausted', 0),
  ('0f95526b-34fe-4e27-bc33-09237a725826'::uuid, 'exhausted', 1),
  ('eb0ab296-6a76-48a1-85c1-c714719634b9'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('8d6a94c1-734f-4e3f-86cf-6756c7b0c2c8', '02a54400-7997-41a1-8e1a-e54c5836c355', '96ea2b52-fca1-4cb8-a002-ccb87281ebab', '18c5e978-ba91-4d29-abe7-c144ab5a3738', 'cbc7bf7c-f759-4227-86f0-02cf2fbcf96e', '346d863e-e882-4ae8-a9e9-529251358654', '121c39df-40b5-4b2e-881b-b08f0467f248', 'b5c05224-d9f1-49a3-9299-3f73d5314c16', 'c4028ed8-b821-4954-8f6f-e7e2d5ad02fe', '0f95526b-34fe-4e27-bc33-09237a725826', 'eb0ab296-6a76-48a1-85c1-c714719634b9') AND status = 'active';  -- 기대 0
