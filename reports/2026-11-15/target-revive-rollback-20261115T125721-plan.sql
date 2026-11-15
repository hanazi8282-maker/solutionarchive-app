-- target-revive 롤백 20261115T125721 — 6행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('4bc34ebf-cd97-4025-8b2c-72cd4e5c4100'::uuid, 'exhausted', 0),
  ('029b77dd-1f94-4e34-b619-2a3a2f43bf07'::uuid, 'exhausted', 0),
  ('085c44e4-e39f-4b34-aa31-eb71ad0d9609'::uuid, 'exhausted', 1),
  ('d57a7963-e50d-4dd6-9d60-878641158a50'::uuid, 'exhausted', 0),
  ('43c1305c-93be-454e-b6fc-767fff64a885'::uuid, 'exhausted', 0),
  ('9147aa05-a5ff-4c4a-b505-5ca7a4f08e42'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('4bc34ebf-cd97-4025-8b2c-72cd4e5c4100', '029b77dd-1f94-4e34-b619-2a3a2f43bf07', '085c44e4-e39f-4b34-aa31-eb71ad0d9609', 'd57a7963-e50d-4dd6-9d60-878641158a50', '43c1305c-93be-454e-b6fc-767fff64a885', '9147aa05-a5ff-4c4a-b505-5ca7a4f08e42') AND status = 'active';  -- 기대 0
