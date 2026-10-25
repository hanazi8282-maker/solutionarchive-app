-- target-revive 롤백 20261025T155036 — 4행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('69d93823-353f-4e21-87c9-f3a210a40d00'::uuid, 'exhausted', 1),
  ('7e087afc-3e16-437b-a9b1-7cc6de953133'::uuid, 'exhausted', 1),
  ('ac24f54c-699a-4d59-b11f-f3189548e145'::uuid, 'exhausted', 1),
  ('7b1c6b2e-37d3-4224-9c33-62063b3c7399'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('69d93823-353f-4e21-87c9-f3a210a40d00', '7e087afc-3e16-437b-a9b1-7cc6de953133', 'ac24f54c-699a-4d59-b11f-f3189548e145', '7b1c6b2e-37d3-4224-9c33-62063b3c7399') AND status = 'active';  -- 기대 0
