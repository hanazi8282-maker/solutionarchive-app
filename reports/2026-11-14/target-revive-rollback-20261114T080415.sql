-- target-revive 롤백 20261114T080415 — 7행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('50e690c7-1368-4a4d-b8a8-26200c122f20'::uuid, 'exhausted', 0),
  ('1c0508ba-03cd-4f32-8f89-c662e15cb371'::uuid, 'exhausted', 1),
  ('a810c6de-479a-433a-aa97-f00a68dfa27d'::uuid, 'exhausted', 0),
  ('38e14300-67a1-48d1-a4c6-37495ed15ca2'::uuid, 'exhausted', 0),
  ('486d317d-2f4b-4ca6-b4ac-fce2134b556e'::uuid, 'exhausted', 0),
  ('acacca93-23ff-48f9-848b-3666c827d7fb'::uuid, 'exhausted', 1),
  ('995a69c1-9960-4c33-be98-0faee957319a'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('50e690c7-1368-4a4d-b8a8-26200c122f20', '1c0508ba-03cd-4f32-8f89-c662e15cb371', 'a810c6de-479a-433a-aa97-f00a68dfa27d', '38e14300-67a1-48d1-a4c6-37495ed15ca2', '486d317d-2f4b-4ca6-b4ac-fce2134b556e', 'acacca93-23ff-48f9-848b-3666c827d7fb', '995a69c1-9960-4c33-be98-0faee957319a') AND status = 'active';  -- 기대 0
