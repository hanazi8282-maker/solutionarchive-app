-- target-revive 롤백 20261101T053813 — 13행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('5d6097af-92c5-4aa0-a8b9-40117e217117'::uuid, 'exhausted', 4),
  ('513fc003-4230-40d2-a420-681655cdbdbf'::uuid, 'exhausted', 3),
  ('070b7bb2-2828-41f9-9f2f-28969105db96'::uuid, 'exhausted', 4),
  ('c63357c4-7e45-475a-8738-362b73275df2'::uuid, 'exhausted', 1),
  ('c86ab6f5-763e-4221-b309-b0fca0030598'::uuid, 'exhausted', 1),
  ('7f1968c1-cabe-4036-aa90-0addaf996bbf'::uuid, 'exhausted', 1),
  ('2d554436-a4e1-4bf7-8882-c6aa456b8bcf'::uuid, 'exhausted', 1),
  ('db45f42a-a3df-49f6-a5ec-33dffd758167'::uuid, 'exhausted', 1),
  ('106a72a7-e5ad-40c6-8a4c-5c20e24f86e1'::uuid, 'exhausted', 1),
  ('1797dc47-998e-4c64-afe8-4f67988d1354'::uuid, 'exhausted', 3),
  ('5449991f-cc35-4314-a8a8-f184c25442fe'::uuid, 'exhausted', 3),
  ('e3a9dcea-85b3-4b32-978c-0b59122a4f89'::uuid, 'exhausted', 4),
  ('0dbad651-6d7e-45eb-8ae7-e0dd324e792b'::uuid, 'exhausted', 4)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('5d6097af-92c5-4aa0-a8b9-40117e217117', '513fc003-4230-40d2-a420-681655cdbdbf', '070b7bb2-2828-41f9-9f2f-28969105db96', 'c63357c4-7e45-475a-8738-362b73275df2', 'c86ab6f5-763e-4221-b309-b0fca0030598', '7f1968c1-cabe-4036-aa90-0addaf996bbf', '2d554436-a4e1-4bf7-8882-c6aa456b8bcf', 'db45f42a-a3df-49f6-a5ec-33dffd758167', '106a72a7-e5ad-40c6-8a4c-5c20e24f86e1', '1797dc47-998e-4c64-afe8-4f67988d1354', '5449991f-cc35-4314-a8a8-f184c25442fe', 'e3a9dcea-85b3-4b32-978c-0b59122a4f89', '0dbad651-6d7e-45eb-8ae7-e0dd324e792b') AND status = 'active';  -- 기대 0
