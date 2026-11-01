-- target-revive 롤백 20261101T081105 — 9행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('06864918-a985-4ed0-8090-6656cdce135b'::uuid, 'exhausted', 3),
  ('0625893b-768f-4a3b-9062-452074b1d27e'::uuid, 'exhausted', 3),
  ('b441ef88-271c-4049-a39b-c72482c1e9a2'::uuid, 'exhausted', 3),
  ('dd4427c4-c669-42aa-b0d0-bff20c96d58d'::uuid, 'exhausted', 1),
  ('924e9ef0-d4d8-41ce-8e55-20a1045c4639'::uuid, 'exhausted', 1),
  ('de734341-ef72-4d86-8bf3-c9d1d45ce326'::uuid, 'exhausted', 1),
  ('ba10072d-e45e-49ed-9eb9-9b72a6ced322'::uuid, 'exhausted', 1),
  ('751934f8-0640-4843-9c8b-8fbe83ccd13e'::uuid, 'exhausted', 1),
  ('c23defb7-16d3-4b4b-8eb2-5590f84f7b09'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('06864918-a985-4ed0-8090-6656cdce135b', '0625893b-768f-4a3b-9062-452074b1d27e', 'b441ef88-271c-4049-a39b-c72482c1e9a2', 'dd4427c4-c669-42aa-b0d0-bff20c96d58d', '924e9ef0-d4d8-41ce-8e55-20a1045c4639', 'de734341-ef72-4d86-8bf3-c9d1d45ce326', 'ba10072d-e45e-49ed-9eb9-9b72a6ced322', '751934f8-0640-4843-9c8b-8fbe83ccd13e', 'c23defb7-16d3-4b4b-8eb2-5590f84f7b09') AND status = 'active';  -- 기대 0
