-- window-discovery 강등 롤백 20261103T033301 — 2행. scripts/window-discovery.mjs 가 UPDATE 전에 썼다.
-- 강등(active→exhausted)만 되돌린다. 그새 다시 active 가 된 행은 건드리지 않는다.
BEGIN;
UPDATE public.review_targets t
   SET status = 'active', consecutive_empty = v.prev_ce
  FROM (VALUES
  ('c68855b3-afe6-4df1-92bc-8d6869de3403'::uuid, 1),
  ('8aca9640-1423-4cc7-a0a1-cfe36d8b9ca2'::uuid, 1)
  ) AS v(id, prev_ce)
 WHERE t.id = v.id AND t.status = 'exhausted';
COMMIT;
