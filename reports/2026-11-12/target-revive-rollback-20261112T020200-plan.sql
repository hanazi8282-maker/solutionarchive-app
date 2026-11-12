-- target-revive 롤백 20261112T020200 — 9행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('a56aaa5e-c29b-43d4-a0ec-37f02a21bc4f'::uuid, 'exhausted', 30),
  ('f2dd9ae0-7e8e-45f6-905a-56989912d711'::uuid, 'exhausted', 3),
  ('db30542b-afc0-4206-b87a-f89f9f3c640f'::uuid, 'exhausted', 4),
  ('7ca08717-4460-4a5f-8566-ac2f3dfa14a5'::uuid, 'exhausted', 0),
  ('f03680a2-aea0-4d32-b1a7-68443e34e3aa'::uuid, 'exhausted', 0),
  ('39c52c3f-19ab-4a76-b215-2eb97712ad0b'::uuid, 'exhausted', 0),
  ('ce1e0c79-9e94-4ed8-a9be-537d6960e157'::uuid, 'exhausted', 0),
  ('1b8ad848-8268-4d03-b933-30610dada204'::uuid, 'exhausted', 0),
  ('5b05b779-d08b-4542-ad35-fd08dbc9037a'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('a56aaa5e-c29b-43d4-a0ec-37f02a21bc4f', 'f2dd9ae0-7e8e-45f6-905a-56989912d711', 'db30542b-afc0-4206-b87a-f89f9f3c640f', '7ca08717-4460-4a5f-8566-ac2f3dfa14a5', 'f03680a2-aea0-4d32-b1a7-68443e34e3aa', '39c52c3f-19ab-4a76-b215-2eb97712ad0b', 'ce1e0c79-9e94-4ed8-a9be-537d6960e157', '1b8ad848-8268-4d03-b933-30610dada204', '5b05b779-d08b-4542-ad35-fd08dbc9037a') AND status = 'active';  -- 기대 0
