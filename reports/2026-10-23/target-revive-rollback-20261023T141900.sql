-- target-revive 롤백 20261023T141900 — 4행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('2583ff3e-b162-4b02-9c7d-7bb38007377f'::uuid, 'exhausted', 3),
  ('104cd10a-acaa-4a7e-ab6a-cb370be360f3'::uuid, 'exhausted', 3),
  ('4fbaa9a1-edcb-45e3-b898-101758fff161'::uuid, 'exhausted', 3),
  ('09973304-ce71-4dfe-9cc8-bd9abd6c8674'::uuid, 'exhausted', 3)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('2583ff3e-b162-4b02-9c7d-7bb38007377f', '104cd10a-acaa-4a7e-ab6a-cb370be360f3', '4fbaa9a1-edcb-45e3-b898-101758fff161', '09973304-ce71-4dfe-9cc8-bd9abd6c8674') AND status = 'active';  -- 기대 0
