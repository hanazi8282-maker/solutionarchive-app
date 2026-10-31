-- target-revive 롤백 20261031T174940 — 7행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('3040452b-fe4f-4084-b59b-2720fa744613'::uuid, 'exhausted', 3),
  ('998e297a-9af5-4368-a9bc-a485ee8d7354'::uuid, 'exhausted', 2),
  ('22b3e5e4-fd9a-4d9e-bec9-5c3970ed3974'::uuid, 'exhausted', 2),
  ('d1622847-8988-4d21-b389-7969a484e4ac'::uuid, 'exhausted', 2),
  ('3e27b97a-51a4-46b1-a216-1f77b1354f63'::uuid, 'exhausted', 2),
  ('9b8ef541-4343-400a-9082-5c8a4b91b1c5'::uuid, 'exhausted', 2),
  ('8e9d98da-eca5-4725-9946-270a5aae347d'::uuid, 'exhausted', 2)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('3040452b-fe4f-4084-b59b-2720fa744613', '998e297a-9af5-4368-a9bc-a485ee8d7354', '22b3e5e4-fd9a-4d9e-bec9-5c3970ed3974', 'd1622847-8988-4d21-b389-7969a484e4ac', '3e27b97a-51a4-46b1-a216-1f77b1354f63', '9b8ef541-4343-400a-9082-5c8a4b91b1c5', '8e9d98da-eca5-4725-9946-270a5aae347d') AND status = 'active';  -- 기대 0
