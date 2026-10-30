-- target-revive 롤백 20261030T060736 — 6행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('04e4f859-ba2c-4bb9-b5d3-ce9efe870fc4'::uuid, 'exhausted', 1),
  ('b78165eb-d282-4247-8c41-bdc849003a77'::uuid, 'exhausted', 1),
  ('7157d58c-cdb3-4238-9161-be79b7987b56'::uuid, 'exhausted', 1),
  ('4e26b9bc-862c-4d98-8a20-9310b889778e'::uuid, 'exhausted', 1),
  ('0fd56b00-0383-45d3-9d76-c32b2948826b'::uuid, 'exhausted', 1),
  ('7f1ca6ac-885a-4b6f-9d60-76852f1bd8fc'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('04e4f859-ba2c-4bb9-b5d3-ce9efe870fc4', 'b78165eb-d282-4247-8c41-bdc849003a77', '7157d58c-cdb3-4238-9161-be79b7987b56', '4e26b9bc-862c-4d98-8a20-9310b889778e', '0fd56b00-0383-45d3-9d76-c32b2948826b', '7f1ca6ac-885a-4b6f-9d60-76852f1bd8fc') AND status = 'active';  -- 기대 0
