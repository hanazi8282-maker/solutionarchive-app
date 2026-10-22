-- target-revive 롤백 20261022T103656 — 9행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('6e320f67-3bd4-4676-9695-579cc61a13e6'::uuid, 'exhausted', 0),
  ('e90a7ba7-7552-451d-a03b-89152369c072'::uuid, 'exhausted', 0),
  ('b1cb4d37-ce3f-447e-b743-278c129a0ead'::uuid, 'exhausted', 0),
  ('e8645905-61a8-4b2a-82c1-bd72afd16162'::uuid, 'exhausted', 0),
  ('71e7d045-f598-482a-915b-9f330c6a0531'::uuid, 'exhausted', 0),
  ('4b50f7d1-5c66-42f8-be1c-141452e001d9'::uuid, 'exhausted', 1),
  ('cd0e012b-10cf-4475-898b-acc3d75a038a'::uuid, 'exhausted', 0),
  ('1e69268a-21c0-4f0c-a9d7-3f058f3f4e76'::uuid, 'exhausted', 3),
  ('848cde21-913c-4ed4-8ddd-ee7f1813cae2'::uuid, 'exhausted', 2)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('6e320f67-3bd4-4676-9695-579cc61a13e6', 'e90a7ba7-7552-451d-a03b-89152369c072', 'b1cb4d37-ce3f-447e-b743-278c129a0ead', 'e8645905-61a8-4b2a-82c1-bd72afd16162', '71e7d045-f598-482a-915b-9f330c6a0531', '4b50f7d1-5c66-42f8-be1c-141452e001d9', 'cd0e012b-10cf-4475-898b-acc3d75a038a', '1e69268a-21c0-4f0c-a9d7-3f058f3f4e76', '848cde21-913c-4ed4-8ddd-ee7f1813cae2') AND status = 'active';  -- 기대 0
