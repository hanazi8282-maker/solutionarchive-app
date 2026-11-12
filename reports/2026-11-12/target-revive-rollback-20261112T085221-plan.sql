-- target-revive 롤백 20261112T085221 — 8행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('b2e3d93d-2901-4574-b4e7-457d834380bb'::uuid, 'exhausted', 4),
  ('d789eda9-3c27-49ed-b5b7-60c8d5b1491d'::uuid, 'exhausted', 1),
  ('f0be74e9-a5fd-471b-a33b-df31803b7625'::uuid, 'exhausted', 1),
  ('1677db23-90b9-4a92-bca0-21e1e9415cbf'::uuid, 'exhausted', 1),
  ('a2fcfc9a-c330-4b85-91cc-b4890e03f96f'::uuid, 'exhausted', 1),
  ('759acbc0-17fd-4bc9-82ff-2777af2fb90f'::uuid, 'exhausted', 1),
  ('0fb6809d-406e-4c92-96da-419e0e3bf3ad'::uuid, 'exhausted', 1),
  ('945251a4-c234-4937-8459-d990dff953cd'::uuid, 'exhausted', 3)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('b2e3d93d-2901-4574-b4e7-457d834380bb', 'd789eda9-3c27-49ed-b5b7-60c8d5b1491d', 'f0be74e9-a5fd-471b-a33b-df31803b7625', '1677db23-90b9-4a92-bca0-21e1e9415cbf', 'a2fcfc9a-c330-4b85-91cc-b4890e03f96f', '759acbc0-17fd-4bc9-82ff-2777af2fb90f', '0fb6809d-406e-4c92-96da-419e0e3bf3ad', '945251a4-c234-4937-8459-d990dff953cd') AND status = 'active';  -- 기대 0
