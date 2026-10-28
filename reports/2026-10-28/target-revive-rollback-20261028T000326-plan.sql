-- target-revive 롤백 20261028T000326 — 10행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('ed72c1ce-bd3b-4a5e-b031-b6d7c2bb2eee'::uuid, 'exhausted', 30),
  ('092020f6-cf42-4b8e-8263-84e6a173fa75'::uuid, 'exhausted', 3),
  ('ff650a67-2cfe-46d1-b554-efc631ee9768'::uuid, 'exhausted', 17),
  ('29081f3c-c98a-4014-9cd3-d266e15b2f5d'::uuid, 'exhausted', 3),
  ('96da377d-cb03-4fc6-94bd-f6c12ceff385'::uuid, 'exhausted', 1),
  ('ceebd0d9-4f8e-4c21-aecb-c082a2ff254b'::uuid, 'exhausted', 1),
  ('d96403a4-3742-4cf9-90e7-e18b92d6318f'::uuid, 'exhausted', 1),
  ('eded2458-2889-4dd6-a7b4-225428d578b0'::uuid, 'exhausted', 1),
  ('37e79ffa-c7e7-4b54-8779-750645873ca2'::uuid, 'exhausted', 1),
  ('2be706da-71e2-4958-89aa-bbce8d917cb6'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('ed72c1ce-bd3b-4a5e-b031-b6d7c2bb2eee', '092020f6-cf42-4b8e-8263-84e6a173fa75', 'ff650a67-2cfe-46d1-b554-efc631ee9768', '29081f3c-c98a-4014-9cd3-d266e15b2f5d', '96da377d-cb03-4fc6-94bd-f6c12ceff385', 'ceebd0d9-4f8e-4c21-aecb-c082a2ff254b', 'd96403a4-3742-4cf9-90e7-e18b92d6318f', 'eded2458-2889-4dd6-a7b4-225428d578b0', '37e79ffa-c7e7-4b54-8779-750645873ca2', '2be706da-71e2-4958-89aa-bbce8d917cb6') AND status = 'active';  -- 기대 0
