-- target-revive 롤백 20261102T135016 — 12행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('4820e865-948f-43ba-b3ea-740fa9e0c76f'::uuid, 'exhausted', 0),
  ('2d981709-7c6e-4739-8aec-d25e8ea12ef9'::uuid, 'exhausted', 0),
  ('6c1eaa98-6c4c-4196-8441-8b7e05b23ed9'::uuid, 'exhausted', 0),
  ('c544d608-7de2-46df-96e7-829e51f4a8cf'::uuid, 'exhausted', 0),
  ('f34e1ca0-175f-451b-ad7b-15447649c975'::uuid, 'exhausted', 0),
  ('71330b7b-7c06-477f-ac4f-7f95568971cf'::uuid, 'exhausted', 0),
  ('58116de9-9277-41f9-8c28-a18f54cce3cc'::uuid, 'exhausted', 2),
  ('7509c7e3-7b0a-44ed-be69-a30c0634faf6'::uuid, 'exhausted', 2),
  ('924c1630-0649-4d64-95b4-e334a068716f'::uuid, 'exhausted', 2),
  ('be0caf21-8b85-4bbc-9545-8fe97160ae1c'::uuid, 'exhausted', 2),
  ('701ae2aa-b548-4b30-889f-bef0ebfd06df'::uuid, 'exhausted', 2),
  ('fdcb7237-1c7d-4808-9629-032d61be22e7'::uuid, 'exhausted', 2)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('4820e865-948f-43ba-b3ea-740fa9e0c76f', '2d981709-7c6e-4739-8aec-d25e8ea12ef9', '6c1eaa98-6c4c-4196-8441-8b7e05b23ed9', 'c544d608-7de2-46df-96e7-829e51f4a8cf', 'f34e1ca0-175f-451b-ad7b-15447649c975', '71330b7b-7c06-477f-ac4f-7f95568971cf', '58116de9-9277-41f9-8c28-a18f54cce3cc', '7509c7e3-7b0a-44ed-be69-a30c0634faf6', '924c1630-0649-4d64-95b4-e334a068716f', 'be0caf21-8b85-4bbc-9545-8fe97160ae1c', '701ae2aa-b548-4b30-889f-bef0ebfd06df', 'fdcb7237-1c7d-4808-9629-032d61be22e7') AND status = 'active';  -- 기대 0
