-- target-revive 롤백 20261118T083819 — 8행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('f434a6d7-85ce-4722-9ee2-286fdeb46497'::uuid, 'exhausted', 0),
  ('783536e1-f196-48fc-a49f-37ed9b82eaa1'::uuid, 'exhausted', 0),
  ('e874f1fb-bc99-47f3-bb87-c1e31408c9ef'::uuid, 'exhausted', 2),
  ('4d045944-e264-4f27-9d39-2280806a4a24'::uuid, 'exhausted', 0),
  ('a4fff16b-59a5-4801-98f1-93be4c085d45'::uuid, 'exhausted', 0),
  ('a17974ca-d81b-4204-af99-114edda7aa1a'::uuid, 'exhausted', 3),
  ('0b2b5dbe-ae21-492a-b51d-5157a6954287'::uuid, 'exhausted', 3),
  ('fe28d8de-1ab9-4e04-a5c7-692373ed9fe2'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('f434a6d7-85ce-4722-9ee2-286fdeb46497', '783536e1-f196-48fc-a49f-37ed9b82eaa1', 'e874f1fb-bc99-47f3-bb87-c1e31408c9ef', '4d045944-e264-4f27-9d39-2280806a4a24', 'a4fff16b-59a5-4801-98f1-93be4c085d45', 'a17974ca-d81b-4204-af99-114edda7aa1a', '0b2b5dbe-ae21-492a-b51d-5157a6954287', 'fe28d8de-1ab9-4e04-a5c7-692373ed9fe2') AND status = 'active';  -- 기대 0
