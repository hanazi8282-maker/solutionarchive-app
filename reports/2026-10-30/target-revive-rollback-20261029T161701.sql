-- target-revive 롤백 20261029T161701 — 6행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('5f0da99c-e18d-4598-a87f-e713deeba446'::uuid, 'exhausted', 1),
  ('8d6a94c1-734f-4e3f-86cf-6756c7b0c2c8'::uuid, 'exhausted', 1),
  ('02a54400-7997-41a1-8e1a-e54c5836c355'::uuid, 'exhausted', 1),
  ('96ea2b52-fca1-4cb8-a002-ccb87281ebab'::uuid, 'exhausted', 1),
  ('18c5e978-ba91-4d29-abe7-c144ab5a3738'::uuid, 'exhausted', 1),
  ('cbc7bf7c-f759-4227-86f0-02cf2fbcf96e'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('5f0da99c-e18d-4598-a87f-e713deeba446', '8d6a94c1-734f-4e3f-86cf-6756c7b0c2c8', '02a54400-7997-41a1-8e1a-e54c5836c355', '96ea2b52-fca1-4cb8-a002-ccb87281ebab', '18c5e978-ba91-4d29-abe7-c144ab5a3738', 'cbc7bf7c-f759-4227-86f0-02cf2fbcf96e') AND status = 'active';  -- 기대 0
