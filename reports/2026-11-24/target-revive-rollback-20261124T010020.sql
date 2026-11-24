-- target-revive 롤백 20261124T010020 — 2행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('5eda3625-834b-4c94-b19e-87f5f0207fb4'::uuid, 'exhausted', 30),
  ('32161e71-b7ab-4da2-bdfd-428b83ee18fc'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('5eda3625-834b-4c94-b19e-87f5f0207fb4', '32161e71-b7ab-4da2-bdfd-428b83ee18fc') AND status = 'active';  -- 기대 0
