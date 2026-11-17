-- target-revive 롤백 20261117T094519 — 9행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('830732b6-9441-471b-8b01-f53839eb41db'::uuid, 'exhausted', 3),
  ('b11c4820-aec6-4156-9643-e85f6e207716'::uuid, 'exhausted', 4),
  ('a76c9974-8f74-400d-bed9-50cf5017859c'::uuid, 'exhausted', 4),
  ('d1160c96-dca6-4f0f-82a0-d34cd326da12'::uuid, 'exhausted', 0),
  ('9fa18276-7fae-4f88-a37c-a1e8e86470bc'::uuid, 'exhausted', 0),
  ('a6c6fad6-90d8-473a-bc6b-51e384124b61'::uuid, 'exhausted', 0),
  ('04e4f859-ba2c-4bb9-b5d3-ce9efe870fc4'::uuid, 'exhausted', 2),
  ('b78165eb-d282-4247-8c41-bdc849003a77'::uuid, 'exhausted', 2),
  ('7157d58c-cdb3-4238-9161-be79b7987b56'::uuid, 'exhausted', 2)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('830732b6-9441-471b-8b01-f53839eb41db', 'b11c4820-aec6-4156-9643-e85f6e207716', 'a76c9974-8f74-400d-bed9-50cf5017859c', 'd1160c96-dca6-4f0f-82a0-d34cd326da12', '9fa18276-7fae-4f88-a37c-a1e8e86470bc', 'a6c6fad6-90d8-473a-bc6b-51e384124b61', '04e4f859-ba2c-4bb9-b5d3-ce9efe870fc4', 'b78165eb-d282-4247-8c41-bdc849003a77', '7157d58c-cdb3-4238-9161-be79b7987b56') AND status = 'active';  -- 기대 0
