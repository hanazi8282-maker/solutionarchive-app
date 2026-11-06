-- target-revive 롤백 20261106T083130 — 6행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('b1cb4d37-ce3f-447e-b743-278c129a0ead'::uuid, 'exhausted', 1),
  ('e8645905-61a8-4b2a-82c1-bd72afd16162'::uuid, 'exhausted', 1),
  ('71e7d045-f598-482a-915b-9f330c6a0531'::uuid, 'exhausted', 1),
  ('4b50f7d1-5c66-42f8-be1c-141452e001d9'::uuid, 'exhausted', 2),
  ('cd0e012b-10cf-4475-898b-acc3d75a038a'::uuid, 'exhausted', 1),
  ('e494487e-958f-4128-921c-c3c76efddfa3'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('b1cb4d37-ce3f-447e-b743-278c129a0ead', 'e8645905-61a8-4b2a-82c1-bd72afd16162', '71e7d045-f598-482a-915b-9f330c6a0531', '4b50f7d1-5c66-42f8-be1c-141452e001d9', 'cd0e012b-10cf-4475-898b-acc3d75a038a', 'e494487e-958f-4128-921c-c3c76efddfa3') AND status = 'active';  -- 기대 0
