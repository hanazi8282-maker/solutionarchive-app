-- target-revive 롤백 20261025T224937 — 12행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('fde8e59a-9758-429f-9d4d-ef0fd69dd6a5'::uuid, 'exhausted', 1),
  ('be3adba5-e5ad-4347-b045-8b803afd4848'::uuid, 'exhausted', 1),
  ('c0936de6-6acb-4a3a-9f3e-6ceb8386ef39'::uuid, 'exhausted', 1),
  ('b159162e-01a1-4bb5-8dc4-07d4ec0e8862'::uuid, 'exhausted', 1),
  ('ad2a5c15-4319-43ef-8a45-264a37057599'::uuid, 'exhausted', 1),
  ('06d9a429-1cb9-4a72-b220-e9b98e45b590'::uuid, 'exhausted', 1),
  ('4a3096f4-6c9d-415d-8227-5b9b69afe6d1'::uuid, 'exhausted', 1),
  ('7b91d490-eb8c-4676-9183-454d6f082511'::uuid, 'exhausted', 1),
  ('3bb9cc9b-6976-4622-b8a0-4665495d66f7'::uuid, 'exhausted', 0),
  ('abb55c64-ae87-4f85-a0cf-ac887fd6ac53'::uuid, 'exhausted', 0),
  ('0adaf23f-e258-4511-bcd3-18239e33384f'::uuid, 'exhausted', 3),
  ('995a69c1-9960-4c33-be98-0faee957319a'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('fde8e59a-9758-429f-9d4d-ef0fd69dd6a5', 'be3adba5-e5ad-4347-b045-8b803afd4848', 'c0936de6-6acb-4a3a-9f3e-6ceb8386ef39', 'b159162e-01a1-4bb5-8dc4-07d4ec0e8862', 'ad2a5c15-4319-43ef-8a45-264a37057599', '06d9a429-1cb9-4a72-b220-e9b98e45b590', '4a3096f4-6c9d-415d-8227-5b9b69afe6d1', '7b91d490-eb8c-4676-9183-454d6f082511', '3bb9cc9b-6976-4622-b8a0-4665495d66f7', 'abb55c64-ae87-4f85-a0cf-ac887fd6ac53', '0adaf23f-e258-4511-bcd3-18239e33384f', '995a69c1-9960-4c33-be98-0faee957319a') AND status = 'active';  -- 기대 0
