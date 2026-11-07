-- window-discovery 강등 롤백 20261107T020342 — 1행. scripts/window-discovery.mjs 가 UPDATE 전에 썼다.
-- 강등(active→exhausted)만 되돌린다. 그새 다시 active 가 된 행은 건드리지 않는다.
BEGIN;
UPDATE public.review_targets t
   SET status = 'active', consecutive_empty = v.prev_ce
  FROM (VALUES
  ('973dba5c-6404-4805-b132-8045bd25fc94'::uuid, 1)
  ) AS v(id, prev_ce)
 WHERE t.id = v.id AND t.status = 'exhausted';
COMMIT;
