-- target-revive 롤백 20261108T053752 — 9행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('138c3c5f-5fa3-4cc5-bba5-467ddb076afc'::uuid, 'exhausted', 4),
  ('400e5aad-9b2e-427a-8204-45ec3e11e15b'::uuid, 'exhausted', 1),
  ('7df4f321-0c92-4f66-ade1-7b965983b421'::uuid, 'exhausted', 1),
  ('5923779f-24b6-4df1-b379-ba011bd03174'::uuid, 'exhausted', 1),
  ('30375426-331d-407f-9ee4-9ea0e3c37f52'::uuid, 'exhausted', 1),
  ('860442ac-6d63-4caf-b8bf-cb30e2038c6f'::uuid, 'exhausted', 4),
  ('5d55a4cc-8247-4c95-9887-83f0aee24eb8'::uuid, 'exhausted', 3),
  ('0a5c8ba7-8206-48b5-bdea-922656f8b42e'::uuid, 'exhausted', 3),
  ('c0bb6414-8ecc-4128-84b9-0c37e889a1b4'::uuid, 'exhausted', 3)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('138c3c5f-5fa3-4cc5-bba5-467ddb076afc', '400e5aad-9b2e-427a-8204-45ec3e11e15b', '7df4f321-0c92-4f66-ade1-7b965983b421', '5923779f-24b6-4df1-b379-ba011bd03174', '30375426-331d-407f-9ee4-9ea0e3c37f52', '860442ac-6d63-4caf-b8bf-cb30e2038c6f', '5d55a4cc-8247-4c95-9887-83f0aee24eb8', '0a5c8ba7-8206-48b5-bdea-922656f8b42e', 'c0bb6414-8ecc-4128-84b9-0c37e889a1b4') AND status = 'active';  -- 기대 0
