-- target-revive 롤백 20261020T180132 — 5행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('35b22aad-759f-4e5e-a21d-6684fe11090e'::uuid, 'exhausted', 1),
  ('390b32ad-a86e-4044-b9c3-9e17007f3d1f'::uuid, 'exhausted', 0),
  ('28f43a50-9670-470b-aa45-b1ebba736b22'::uuid, 'exhausted', 0),
  ('4009d85c-984c-4ce8-bd53-a1f11a63af6e'::uuid, 'exhausted', 0),
  ('11d86731-57f0-4f61-9e2d-e62b7c2e31bc'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('35b22aad-759f-4e5e-a21d-6684fe11090e', '390b32ad-a86e-4044-b9c3-9e17007f3d1f', '28f43a50-9670-470b-aa45-b1ebba736b22', '4009d85c-984c-4ce8-bd53-a1f11a63af6e', '11d86731-57f0-4f61-9e2d-e62b7c2e31bc') AND status = 'active';  -- 기대 0
