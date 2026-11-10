-- target-revive 롤백 20261110T171122 — 7행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('5d6097af-92c5-4aa0-a8b9-40117e217117'::uuid, 'exhausted', 1),
  ('f885a18a-8246-431f-b1a9-751b89930f6f'::uuid, 'exhausted', 1),
  ('402985f0-61c5-4bdc-a448-88de13a8f9e2'::uuid, 'exhausted', 0),
  ('f3a31c2b-1452-4e6f-b7b9-1cd644352946'::uuid, 'exhausted', 0),
  ('b02213be-da26-4ff3-97b3-348f86c9efb0'::uuid, 'exhausted', 0),
  ('cb995e22-d8a3-491b-a0b8-b576839acebc'::uuid, 'exhausted', 0),
  ('54b5f300-e4ca-48f4-842e-9d8bea9243f7'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('5d6097af-92c5-4aa0-a8b9-40117e217117', 'f885a18a-8246-431f-b1a9-751b89930f6f', '402985f0-61c5-4bdc-a448-88de13a8f9e2', 'f3a31c2b-1452-4e6f-b7b9-1cd644352946', 'b02213be-da26-4ff3-97b3-348f86c9efb0', 'cb995e22-d8a3-491b-a0b8-b576839acebc', '54b5f300-e4ca-48f4-842e-9d8bea9243f7') AND status = 'active';  -- 기대 0
