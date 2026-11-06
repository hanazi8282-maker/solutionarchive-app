-- target-revive 롤백 20261106T221940 — 3행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('237cfb99-a00b-4e79-b2bc-ea4dc69f1ac3'::uuid, 'exhausted', 1),
  ('7f00dca1-dc70-4188-9416-2000615ef9d7'::uuid, 'exhausted', 1),
  ('c4a320cc-bbc9-42ef-bd4d-2a10fef62f87'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('237cfb99-a00b-4e79-b2bc-ea4dc69f1ac3', '7f00dca1-dc70-4188-9416-2000615ef9d7', 'c4a320cc-bbc9-42ef-bd4d-2a10fef62f87') AND status = 'active';  -- 기대 0
