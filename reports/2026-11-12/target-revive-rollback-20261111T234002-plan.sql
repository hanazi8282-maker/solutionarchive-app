-- target-revive 롤백 20261111T234002 — 7행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('d390ef97-49cc-4ea1-b739-2ad712053841'::uuid, 'exhausted', 0),
  ('4694f74f-d8a8-4b64-abe9-00593c113195'::uuid, 'exhausted', 0),
  ('f0a8c81e-5cc0-4e92-96fc-a75aceb5eb33'::uuid, 'exhausted', 0),
  ('1d9c0709-d9b3-4736-896c-2d62c09ba013'::uuid, 'exhausted', 0),
  ('4ccfbd4d-6df1-48b2-bd31-1fd18efda7da'::uuid, 'exhausted', 0),
  ('558f2844-4c74-4367-a03f-8f9cb647ff86'::uuid, 'exhausted', 0),
  ('90ec0b32-cee1-4ced-9237-301f89bb6a61'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('d390ef97-49cc-4ea1-b739-2ad712053841', '4694f74f-d8a8-4b64-abe9-00593c113195', 'f0a8c81e-5cc0-4e92-96fc-a75aceb5eb33', '1d9c0709-d9b3-4736-896c-2d62c09ba013', '4ccfbd4d-6df1-48b2-bd31-1fd18efda7da', '558f2844-4c74-4367-a03f-8f9cb647ff86', '90ec0b32-cee1-4ced-9237-301f89bb6a61') AND status = 'active';  -- 기대 0
