-- target-revive 롤백 20261029T002710 — 11행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('e8d51ec0-cfb9-49b7-9036-0970dc9c8380'::uuid, 'exhausted', 3),
  ('0f6c449c-1bde-48b2-b667-d9b3e15de6fe'::uuid, 'exhausted', 3),
  ('4b321913-cf7f-4c15-ae90-ab7f46ea599b'::uuid, 'exhausted', 3),
  ('b11c4820-aec6-4156-9643-e85f6e207716'::uuid, 'exhausted', 3),
  ('75133a29-7dab-4f45-b100-2c20d83b564c'::uuid, 'exhausted', 3),
  ('029b77dd-1f94-4e34-b619-2a3a2f43bf07'::uuid, 'exhausted', 1),
  ('085c44e4-e39f-4b34-aa31-eb71ad0d9609'::uuid, 'exhausted', 0),
  ('d57a7963-e50d-4dd6-9d60-878641158a50'::uuid, 'exhausted', 1),
  ('43c1305c-93be-454e-b6fc-767fff64a885'::uuid, 'exhausted', 1),
  ('9147aa05-a5ff-4c4a-b505-5ca7a4f08e42'::uuid, 'exhausted', 1),
  ('79509364-932a-451e-ba26-e305ad872a11'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('e8d51ec0-cfb9-49b7-9036-0970dc9c8380', '0f6c449c-1bde-48b2-b667-d9b3e15de6fe', '4b321913-cf7f-4c15-ae90-ab7f46ea599b', 'b11c4820-aec6-4156-9643-e85f6e207716', '75133a29-7dab-4f45-b100-2c20d83b564c', '029b77dd-1f94-4e34-b619-2a3a2f43bf07', '085c44e4-e39f-4b34-aa31-eb71ad0d9609', 'd57a7963-e50d-4dd6-9d60-878641158a50', '43c1305c-93be-454e-b6fc-767fff64a885', '9147aa05-a5ff-4c4a-b505-5ca7a4f08e42', '79509364-932a-451e-ba26-e305ad872a11') AND status = 'active';  -- 기대 0
