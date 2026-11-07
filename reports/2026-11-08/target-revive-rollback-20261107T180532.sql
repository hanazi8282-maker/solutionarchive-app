-- target-revive 롤백 20261107T180532 — 6행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('43a4b4ac-3ec5-446e-9e81-681f4d183154'::uuid, 'exhausted', 4),
  ('742ccaaf-ef09-422d-8c2d-6c8c2b6dc299'::uuid, 'exhausted', 1),
  ('90b9a963-51ed-49fc-a51c-487ab890d788'::uuid, 'exhausted', 1),
  ('ba6bd43f-064c-42a9-a069-4004919dfbc4'::uuid, 'exhausted', 1),
  ('5d825d87-c20b-49ec-92bb-13b4ec92f66d'::uuid, 'exhausted', 1),
  ('8e5c684a-0b5f-4a5f-a66f-c9c054296062'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('43a4b4ac-3ec5-446e-9e81-681f4d183154', '742ccaaf-ef09-422d-8c2d-6c8c2b6dc299', '90b9a963-51ed-49fc-a51c-487ab890d788', 'ba6bd43f-064c-42a9-a069-4004919dfbc4', '5d825d87-c20b-49ec-92bb-13b4ec92f66d', '8e5c684a-0b5f-4a5f-a66f-c9c054296062') AND status = 'active';  -- 기대 0
