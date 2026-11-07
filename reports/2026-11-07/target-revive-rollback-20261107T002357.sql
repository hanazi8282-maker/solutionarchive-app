-- target-revive 롤백 20261107T002357 — 9행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('0a2e35cf-84a7-4636-8fa8-85ef4d7b216a'::uuid, 'exhausted', 4),
  ('9f9f9a15-cb79-4ea6-9540-cb538e5ad290'::uuid, 'exhausted', 4),
  ('8670d507-ee7e-4444-8ae7-497e4ec52767'::uuid, 'exhausted', 4),
  ('30589faf-8821-46b6-8719-27215fb6baa5'::uuid, 'exhausted', 1),
  ('9ae314c7-3bcf-49ba-ba28-a3e154b27636'::uuid, 'exhausted', 1),
  ('c7a08716-3c5a-4869-b134-7c509cd9bf87'::uuid, 'exhausted', 1),
  ('05adb222-41a2-4719-a669-880b340fd6eb'::uuid, 'exhausted', 0),
  ('d4ec3c41-0452-44f5-aead-ec0b55ad0233'::uuid, 'exhausted', 1),
  ('973dba5c-6404-4805-b132-8045bd25fc94'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('0a2e35cf-84a7-4636-8fa8-85ef4d7b216a', '9f9f9a15-cb79-4ea6-9540-cb538e5ad290', '8670d507-ee7e-4444-8ae7-497e4ec52767', '30589faf-8821-46b6-8719-27215fb6baa5', '9ae314c7-3bcf-49ba-ba28-a3e154b27636', 'c7a08716-3c5a-4869-b134-7c509cd9bf87', '05adb222-41a2-4719-a669-880b340fd6eb', 'd4ec3c41-0452-44f5-aead-ec0b55ad0233', '973dba5c-6404-4805-b132-8045bd25fc94') AND status = 'active';  -- 기대 0
