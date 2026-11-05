-- window-discovery 강등 롤백 20261105T023711 — 6행. scripts/window-discovery.mjs 가 UPDATE 전에 썼다.
-- 강등(active→exhausted)만 되돌린다. 그새 다시 active 가 된 행은 건드리지 않는다.
BEGIN;
UPDATE public.review_targets t
   SET status = 'active', consecutive_empty = v.prev_ce
  FROM (VALUES
  ('bdd1dce0-d59e-49ba-ada8-adeea4272ac9'::uuid, 1),
  ('d487cb94-643b-42a6-b1cc-f8594e3edee8'::uuid, 1),
  ('62726b81-b49b-4786-90a2-1cc6722b5b09'::uuid, 1),
  ('fc240947-cc2e-4d52-b58c-9139ed2138ab'::uuid, 1),
  ('551d564d-435b-436a-ba6c-2c5902a934e3'::uuid, 1),
  ('3ff1a17b-e3c4-4e37-91db-e928aeb3b4a0'::uuid, 1)
  ) AS v(id, prev_ce)
 WHERE t.id = v.id AND t.status = 'exhausted';
COMMIT;
