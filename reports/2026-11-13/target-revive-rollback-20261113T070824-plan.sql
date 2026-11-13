-- target-revive 롤백 20261113T070824 — 7행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('3da4dce9-b853-4637-81c8-126159583a79'::uuid, 'exhausted', 3),
  ('d96403a4-3742-4cf9-90e7-e18b92d6318f'::uuid, 'exhausted', 2),
  ('eded2458-2889-4dd6-a7b4-225428d578b0'::uuid, 'exhausted', 0),
  ('37e79ffa-c7e7-4b54-8779-750645873ca2'::uuid, 'exhausted', 0),
  ('2be706da-71e2-4958-89aa-bbce8d917cb6'::uuid, 'exhausted', 0),
  ('a4f4a1af-ea2b-4577-875a-cd1f5292c4e9'::uuid, 'exhausted', 2),
  ('701d8a81-d670-4e86-831e-acb7c3d67269'::uuid, 'exhausted', 2)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('3da4dce9-b853-4637-81c8-126159583a79', 'd96403a4-3742-4cf9-90e7-e18b92d6318f', 'eded2458-2889-4dd6-a7b4-225428d578b0', '37e79ffa-c7e7-4b54-8779-750645873ca2', '2be706da-71e2-4958-89aa-bbce8d917cb6', 'a4f4a1af-ea2b-4577-875a-cd1f5292c4e9', '701d8a81-d670-4e86-831e-acb7c3d67269') AND status = 'active';  -- 기대 0
