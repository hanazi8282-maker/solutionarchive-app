-- target-revive 롤백 20261116T002513 — 12행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('54d04c39-db42-49b1-a815-c215d6f9d38b'::uuid, 'exhausted', 30),
  ('14a4e9a2-c3ef-444c-874d-100c67e67ce0'::uuid, 'exhausted', 2),
  ('f64f1992-a88e-41e8-ac4b-12f1456d8630'::uuid, 'exhausted', 2),
  ('bb8a3a5c-44d4-45a6-accc-4f5d9e08837a'::uuid, 'exhausted', 2),
  ('1e9c2681-0a36-4380-98a8-c37422633e2a'::uuid, 'exhausted', 2),
  ('168aa141-59f9-4e59-a01d-6aaecd197961'::uuid, 'exhausted', 2),
  ('5f0da99c-e18d-4598-a87f-e713deeba446'::uuid, 'exhausted', 0),
  ('1797dc47-998e-4c64-afe8-4f67988d1354'::uuid, 'exhausted', 4),
  ('5449991f-cc35-4314-a8a8-f184c25442fe'::uuid, 'exhausted', 4),
  ('29ab231f-8e97-4a9f-93bd-91dffdc49371'::uuid, 'exhausted', 3),
  ('569c981b-f0c6-492f-b977-343b85b6b037'::uuid, 'exhausted', 3),
  ('513fc003-4230-40d2-a420-681655cdbdbf'::uuid, 'exhausted', 3)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('54d04c39-db42-49b1-a815-c215d6f9d38b', '14a4e9a2-c3ef-444c-874d-100c67e67ce0', 'f64f1992-a88e-41e8-ac4b-12f1456d8630', 'bb8a3a5c-44d4-45a6-accc-4f5d9e08837a', '1e9c2681-0a36-4380-98a8-c37422633e2a', '168aa141-59f9-4e59-a01d-6aaecd197961', '5f0da99c-e18d-4598-a87f-e713deeba446', '1797dc47-998e-4c64-afe8-4f67988d1354', '5449991f-cc35-4314-a8a8-f184c25442fe', '29ab231f-8e97-4a9f-93bd-91dffdc49371', '569c981b-f0c6-492f-b977-343b85b6b037', '513fc003-4230-40d2-a420-681655cdbdbf') AND status = 'active';  -- 기대 0
