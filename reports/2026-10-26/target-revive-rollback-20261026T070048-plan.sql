-- target-revive 롤백 20261026T070048 — 7행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('374893fa-825e-4e22-a976-6141a0eded50'::uuid, 'exhausted', 3),
  ('7cb105d5-ecca-4017-b5a8-e4a977bff86c'::uuid, 'exhausted', 1),
  ('65808a90-4d67-424f-b036-7d6e46635990'::uuid, 'exhausted', 1),
  ('7eda1056-9037-4483-b204-d6103823d8a1'::uuid, 'exhausted', 1),
  ('27f71556-e9f4-495c-85a2-6778dc029a13'::uuid, 'exhausted', 0),
  ('8bcdfe7f-70ce-4320-ab5c-9e74d8c2d96f'::uuid, 'exhausted', 1),
  ('0ebc58de-f4f7-4ab8-bee9-15c75f2722b6'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('374893fa-825e-4e22-a976-6141a0eded50', '7cb105d5-ecca-4017-b5a8-e4a977bff86c', '65808a90-4d67-424f-b036-7d6e46635990', '7eda1056-9037-4483-b204-d6103823d8a1', '27f71556-e9f4-495c-85a2-6778dc029a13', '8bcdfe7f-70ce-4320-ab5c-9e74d8c2d96f', '0ebc58de-f4f7-4ab8-bee9-15c75f2722b6') AND status = 'active';  -- 기대 0
