-- target-revive 롤백 20261115T220118 — 5행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('f75529e5-d498-443e-99c0-94ac6f82bd04'::uuid, 'exhausted', 2),
  ('7d8ecf8b-65d3-431d-a86a-07592fc67af9'::uuid, 'exhausted', 2),
  ('c7d69c93-2b19-47f9-a2ad-1988a828ff6b'::uuid, 'exhausted', 0),
  ('d626f889-f616-4dd5-99a9-42ad339f875f'::uuid, 'exhausted', 4),
  ('deda7247-0d84-453f-ade6-c31fe88f17ff'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('f75529e5-d498-443e-99c0-94ac6f82bd04', '7d8ecf8b-65d3-431d-a86a-07592fc67af9', 'c7d69c93-2b19-47f9-a2ad-1988a828ff6b', 'd626f889-f616-4dd5-99a9-42ad339f875f', 'deda7247-0d84-453f-ade6-c31fe88f17ff') AND status = 'active';  -- 기대 0
