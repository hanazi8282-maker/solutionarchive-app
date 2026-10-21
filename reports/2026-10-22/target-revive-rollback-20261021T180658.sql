-- target-revive 롤백 20261021T180658 — 7행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('0a07a2ac-fdd3-4f9e-a93a-ec9a03fbd3e5'::uuid, 'exhausted', 0),
  ('58116de9-9277-41f9-8c28-a18f54cce3cc'::uuid, 'exhausted', 1),
  ('7509c7e3-7b0a-44ed-be69-a30c0634faf6'::uuid, 'exhausted', 1),
  ('924c1630-0649-4d64-95b4-e334a068716f'::uuid, 'exhausted', 1),
  ('be0caf21-8b85-4bbc-9545-8fe97160ae1c'::uuid, 'exhausted', 1),
  ('701ae2aa-b548-4b30-889f-bef0ebfd06df'::uuid, 'exhausted', 1),
  ('baf9bafc-0de5-498f-b257-fd0b619087c6'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('0a07a2ac-fdd3-4f9e-a93a-ec9a03fbd3e5', '58116de9-9277-41f9-8c28-a18f54cce3cc', '7509c7e3-7b0a-44ed-be69-a30c0634faf6', '924c1630-0649-4d64-95b4-e334a068716f', 'be0caf21-8b85-4bbc-9545-8fe97160ae1c', '701ae2aa-b548-4b30-889f-bef0ebfd06df', 'baf9bafc-0de5-498f-b257-fd0b619087c6') AND status = 'active';  -- 기대 0
