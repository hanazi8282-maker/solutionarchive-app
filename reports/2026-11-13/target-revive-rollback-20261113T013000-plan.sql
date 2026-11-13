-- target-revive 롤백 20261113T013000 — 8행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('ed72c1ce-bd3b-4a5e-b031-b6d7c2bb2eee'::uuid, 'exhausted', 8),
  ('237f6cc9-cc66-4c42-97f5-c3dcc8609006'::uuid, 'exhausted', 0),
  ('626ae43a-df8d-4747-a8ec-3603b5a4c036'::uuid, 'exhausted', 0),
  ('c22835ba-5a01-4371-bd49-78bb916601d9'::uuid, 'exhausted', 0),
  ('f94e9ffc-30c7-426d-82a7-3dfc44402a1b'::uuid, 'exhausted', 0),
  ('96da377d-cb03-4fc6-94bd-f6c12ceff385'::uuid, 'exhausted', 0),
  ('ceebd0d9-4f8e-4c21-aecb-c082a2ff254b'::uuid, 'exhausted', 0),
  ('05761a58-5dda-4b32-be6c-8752e15c85cf'::uuid, 'exhausted', 3)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('ed72c1ce-bd3b-4a5e-b031-b6d7c2bb2eee', '237f6cc9-cc66-4c42-97f5-c3dcc8609006', '626ae43a-df8d-4747-a8ec-3603b5a4c036', 'c22835ba-5a01-4371-bd49-78bb916601d9', 'f94e9ffc-30c7-426d-82a7-3dfc44402a1b', '96da377d-cb03-4fc6-94bd-f6c12ceff385', 'ceebd0d9-4f8e-4c21-aecb-c082a2ff254b', '05761a58-5dda-4b32-be6c-8752e15c85cf') AND status = 'active';  -- 기대 0
