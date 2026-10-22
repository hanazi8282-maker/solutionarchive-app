-- target-revive 롤백 20261022T233839 — 6행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('5923779f-24b6-4df1-b379-ba011bd03174'::uuid, 'exhausted', 0),
  ('30375426-331d-407f-9ee4-9ea0e3c37f52'::uuid, 'exhausted', 0),
  ('d164b39f-d2d5-4e4f-becc-c825bd157a88'::uuid, 'exhausted', 0),
  ('d312b6fd-b438-4e5d-b700-b32b92f26bc7'::uuid, 'exhausted', 0),
  ('9638a0e3-0971-4510-b822-bfa7572f9930'::uuid, 'exhausted', 0),
  ('67981bdb-e933-4838-abc8-6f06b7f2c2f4'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('5923779f-24b6-4df1-b379-ba011bd03174', '30375426-331d-407f-9ee4-9ea0e3c37f52', 'd164b39f-d2d5-4e4f-becc-c825bd157a88', 'd312b6fd-b438-4e5d-b700-b32b92f26bc7', '9638a0e3-0971-4510-b822-bfa7572f9930', '67981bdb-e933-4838-abc8-6f06b7f2c2f4') AND status = 'active';  -- 기대 0
