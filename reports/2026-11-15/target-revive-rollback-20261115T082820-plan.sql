-- target-revive 롤백 20261115T082820 — 6행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('34311a9a-1364-40ac-be1a-767ccb0a5834'::uuid, 'exhausted', 1),
  ('47c980aa-f3fa-4d77-bc21-e71fe3e4bf8c'::uuid, 'exhausted', 1),
  ('4980da39-7d2c-4568-a72f-983aa12af990'::uuid, 'exhausted', 0),
  ('91b349ae-94c9-4f6d-8d16-ad335b2fb681'::uuid, 'exhausted', 0),
  ('575b248a-d4d1-4b60-b1e2-36d7387b2837'::uuid, 'exhausted', 0),
  ('6f63880e-0926-4dd3-bb9f-c08e78706d60'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('34311a9a-1364-40ac-be1a-767ccb0a5834', '47c980aa-f3fa-4d77-bc21-e71fe3e4bf8c', '4980da39-7d2c-4568-a72f-983aa12af990', '91b349ae-94c9-4f6d-8d16-ad335b2fb681', '575b248a-d4d1-4b60-b1e2-36d7387b2837', '6f63880e-0926-4dd3-bb9f-c08e78706d60') AND status = 'active';  -- 기대 0
