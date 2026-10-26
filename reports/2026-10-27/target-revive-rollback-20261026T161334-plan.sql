-- target-revive 롤백 20261026T161334 — 6행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('3e48dadb-1868-42a9-aa23-41d93c42d4ad'::uuid, 'exhausted', 1),
  ('937d1a7a-d92f-4bf7-ac65-d1a715a1fb7c'::uuid, 'exhausted', 0),
  ('7f7ec1c8-3d68-48e3-9ffd-9bfe34a3d7d2'::uuid, 'exhausted', 0),
  ('cd6104b4-3b94-49f3-99f3-11c908fdd72c'::uuid, 'exhausted', 0),
  ('71acb496-7455-4efb-b352-d25df305e7a3'::uuid, 'exhausted', 0),
  ('741e789e-3efc-4336-a78b-8be477eb7eb9'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('3e48dadb-1868-42a9-aa23-41d93c42d4ad', '937d1a7a-d92f-4bf7-ac65-d1a715a1fb7c', '7f7ec1c8-3d68-48e3-9ffd-9bfe34a3d7d2', 'cd6104b4-3b94-49f3-99f3-11c908fdd72c', '71acb496-7455-4efb-b352-d25df305e7a3', '741e789e-3efc-4336-a78b-8be477eb7eb9') AND status = 'active';  -- 기대 0
