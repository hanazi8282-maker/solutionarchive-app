-- target-revive 롤백 20261106T195920 — 8행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('60b0a0d0-6003-462e-acfa-67d095f4af28'::uuid, 'exhausted', 4),
  ('a5f05222-2b09-415f-95cd-4dbb491b753c'::uuid, 'exhausted', 1),
  ('56665469-1087-4950-9c84-e4d5bfa30096'::uuid, 'exhausted', 1),
  ('91f1542c-5757-4ba6-bd2f-ba85161dda5a'::uuid, 'exhausted', 1),
  ('3fb3a62f-d19f-4815-a3cc-a8821c74699f'::uuid, 'exhausted', 1),
  ('59de0327-db16-4385-95ee-a101ac98ac7e'::uuid, 'exhausted', 1),
  ('6668e7b4-fb2d-4d2c-a092-a4a6855045ab'::uuid, 'exhausted', 1),
  ('143a81d3-6ab1-4d3f-8844-d13259be5cf5'::uuid, 'exhausted', 9)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('60b0a0d0-6003-462e-acfa-67d095f4af28', 'a5f05222-2b09-415f-95cd-4dbb491b753c', '56665469-1087-4950-9c84-e4d5bfa30096', '91f1542c-5757-4ba6-bd2f-ba85161dda5a', '3fb3a62f-d19f-4815-a3cc-a8821c74699f', '59de0327-db16-4385-95ee-a101ac98ac7e', '6668e7b4-fb2d-4d2c-a092-a4a6855045ab', '143a81d3-6ab1-4d3f-8844-d13259be5cf5') AND status = 'active';  -- 기대 0
