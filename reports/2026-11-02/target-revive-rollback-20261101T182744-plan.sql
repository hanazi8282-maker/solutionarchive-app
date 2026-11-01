-- target-revive 롤백 20261101T182744 — 7행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('17790f7a-6857-4b32-ace1-2183730b1868'::uuid, 'exhausted', 0),
  ('c29415f1-5ad3-4a4d-9263-c963c3792379'::uuid, 'exhausted', 1),
  ('0b9c5a77-909e-4f5f-a0d3-8f4dc87e847b'::uuid, 'exhausted', 1),
  ('29e02cde-75a0-4c30-baa8-2d9908f9c09b'::uuid, 'exhausted', 1),
  ('06849eaf-ae32-4297-8205-c30fc83383a7'::uuid, 'exhausted', 1),
  ('0c12e051-c450-471a-ba22-cd3e419314dc'::uuid, 'exhausted', 1),
  ('608544ac-f784-4c8f-8f60-5786ee4dd5c0'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('17790f7a-6857-4b32-ace1-2183730b1868', 'c29415f1-5ad3-4a4d-9263-c963c3792379', '0b9c5a77-909e-4f5f-a0d3-8f4dc87e847b', '29e02cde-75a0-4c30-baa8-2d9908f9c09b', '06849eaf-ae32-4297-8205-c30fc83383a7', '0c12e051-c450-471a-ba22-cd3e419314dc', '608544ac-f784-4c8f-8f60-5786ee4dd5c0') AND status = 'active';  -- 기대 0
