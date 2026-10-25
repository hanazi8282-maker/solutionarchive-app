-- target-revive 롤백 20261025T152223 — 7행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('d4263d18-9696-462a-aa3e-6b06db9f6a5d'::uuid, 'exhausted', 3),
  ('cb995e22-d8a3-491b-a0b8-b576839acebc'::uuid, 'exhausted', 0),
  ('54b5f300-e4ca-48f4-842e-9d8bea9243f7'::uuid, 'exhausted', 0),
  ('e550103a-dd5e-45f9-86cb-5daf8aed1c19'::uuid, 'exhausted', 0),
  ('a0d818fe-1fd4-4711-b9d4-64d6315370b1'::uuid, 'exhausted', 0),
  ('9c31447c-2816-43af-ab63-d8b31ae85f2f'::uuid, 'exhausted', 1),
  ('24cfbc32-4089-4bac-9442-794218997859'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('d4263d18-9696-462a-aa3e-6b06db9f6a5d', 'cb995e22-d8a3-491b-a0b8-b576839acebc', '54b5f300-e4ca-48f4-842e-9d8bea9243f7', 'e550103a-dd5e-45f9-86cb-5daf8aed1c19', 'a0d818fe-1fd4-4711-b9d4-64d6315370b1', '9c31447c-2816-43af-ab63-d8b31ae85f2f', '24cfbc32-4089-4bac-9442-794218997859') AND status = 'active';  -- 기대 0
