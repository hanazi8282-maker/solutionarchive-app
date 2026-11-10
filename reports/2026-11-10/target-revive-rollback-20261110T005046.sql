-- target-revive 롤백 20261110T005046 — 9행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('dd338e50-a856-463a-8988-a9f111340440'::uuid, 'exhausted', 30),
  ('ea2ed23a-595f-4937-91a6-184325947f89'::uuid, 'exhausted', 0),
  ('c9160a90-d48b-44a2-968b-b081f44ba4a0'::uuid, 'exhausted', 0),
  ('b2f94853-e09e-4851-9779-a0649ed40362'::uuid, 'exhausted', 0),
  ('6e3ec008-38f4-44af-9971-7039f3b790ce'::uuid, 'exhausted', 0),
  ('5c0eb015-5a2e-4a81-b060-650de6dbc80d'::uuid, 'exhausted', 0),
  ('5b461602-bef3-498d-8a7e-0261955d5b4a'::uuid, 'exhausted', 0),
  ('399581f8-f332-48c9-b444-b96f84922de1'::uuid, 'exhausted', 3),
  ('57b82620-6593-48ff-895d-4fe4413d6348'::uuid, 'exhausted', 3)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('dd338e50-a856-463a-8988-a9f111340440', 'ea2ed23a-595f-4937-91a6-184325947f89', 'c9160a90-d48b-44a2-968b-b081f44ba4a0', 'b2f94853-e09e-4851-9779-a0649ed40362', '6e3ec008-38f4-44af-9971-7039f3b790ce', '5c0eb015-5a2e-4a81-b060-650de6dbc80d', '5b461602-bef3-498d-8a7e-0261955d5b4a', '399581f8-f332-48c9-b444-b96f84922de1', '57b82620-6593-48ff-895d-4fe4413d6348') AND status = 'active';  -- 기대 0
