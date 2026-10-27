-- target-revive 롤백 20261027T212800 — 6행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('a8efd6f5-d22a-4aca-8475-e4c4e9e13abb'::uuid, 'exhausted', 1),
  ('5122c07a-7160-49d3-a08b-9d9ec90d2f75'::uuid, 'exhausted', 1),
  ('237f6cc9-cc66-4c42-97f5-c3dcc8609006'::uuid, 'exhausted', 1),
  ('626ae43a-df8d-4747-a8ec-3603b5a4c036'::uuid, 'exhausted', 1),
  ('c22835ba-5a01-4371-bd49-78bb916601d9'::uuid, 'exhausted', 1),
  ('f94e9ffc-30c7-426d-82a7-3dfc44402a1b'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('a8efd6f5-d22a-4aca-8475-e4c4e9e13abb', '5122c07a-7160-49d3-a08b-9d9ec90d2f75', '237f6cc9-cc66-4c42-97f5-c3dcc8609006', '626ae43a-df8d-4747-a8ec-3603b5a4c036', 'c22835ba-5a01-4371-bd49-78bb916601d9', 'f94e9ffc-30c7-426d-82a7-3dfc44402a1b') AND status = 'active';  -- 기대 0
