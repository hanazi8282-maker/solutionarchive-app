-- target-revive 롤백 20261027T105626 — 6행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('899f5eae-252b-453a-b2d6-42f48d959fdf'::uuid, 'exhausted', 0),
  ('d143dc65-23e1-4476-b017-78c009bd6f07'::uuid, 'exhausted', 0),
  ('de0c063c-a4f2-4033-8f9c-8d4c71f09784'::uuid, 'exhausted', 0),
  ('e4c4a260-9e2a-4e57-b913-598e7916b2c9'::uuid, 'exhausted', 0),
  ('38e27902-fdd5-4d4e-8a4b-d4f91f058c53'::uuid, 'exhausted', 1),
  ('7889c6ed-54d0-4996-b6ad-3b02712743f3'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('899f5eae-252b-453a-b2d6-42f48d959fdf', 'd143dc65-23e1-4476-b017-78c009bd6f07', 'de0c063c-a4f2-4033-8f9c-8d4c71f09784', 'e4c4a260-9e2a-4e57-b913-598e7916b2c9', '38e27902-fdd5-4d4e-8a4b-d4f91f058c53', '7889c6ed-54d0-4996-b6ad-3b02712743f3') AND status = 'active';  -- 기대 0
