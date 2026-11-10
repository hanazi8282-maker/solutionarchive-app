-- target-revive 롤백 20261110T203037 — 7행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('e550103a-dd5e-45f9-86cb-5daf8aed1c19'::uuid, 'exhausted', 1),
  ('a0d818fe-1fd4-4711-b9d4-64d6315370b1'::uuid, 'exhausted', 1),
  ('9c31447c-2816-43af-ab63-d8b31ae85f2f'::uuid, 'exhausted', 0),
  ('24cfbc32-4089-4bac-9442-794218997859'::uuid, 'exhausted', 0),
  ('69d93823-353f-4e21-87c9-f3a210a40d00'::uuid, 'exhausted', 0),
  ('7e087afc-3e16-437b-a9b1-7cc6de953133'::uuid, 'exhausted', 0),
  ('3c66d874-9ec4-40b0-bb82-24e8c37629e2'::uuid, 'exhausted', 3)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('e550103a-dd5e-45f9-86cb-5daf8aed1c19', 'a0d818fe-1fd4-4711-b9d4-64d6315370b1', '9c31447c-2816-43af-ab63-d8b31ae85f2f', '24cfbc32-4089-4bac-9442-794218997859', '69d93823-353f-4e21-87c9-f3a210a40d00', '7e087afc-3e16-437b-a9b1-7cc6de953133', '3c66d874-9ec4-40b0-bb82-24e8c37629e2') AND status = 'active';  -- 기대 0
