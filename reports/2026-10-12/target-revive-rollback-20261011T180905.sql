-- target-revive 롤백 20261011T180905 — 5행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('90ec0b32-cee1-4ced-9237-301f89bb6a61'::uuid, 'exhausted', 0),
  ('fde8e59a-9758-429f-9d4d-ef0fd69dd6a5'::uuid, 'exhausted', 0),
  ('be3adba5-e5ad-4347-b045-8b803afd4848'::uuid, 'exhausted', 0),
  ('c0936de6-6acb-4a3a-9f3e-6ceb8386ef39'::uuid, 'exhausted', 0),
  ('b159162e-01a1-4bb5-8dc4-07d4ec0e8862'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('90ec0b32-cee1-4ced-9237-301f89bb6a61', 'fde8e59a-9758-429f-9d4d-ef0fd69dd6a5', 'be3adba5-e5ad-4347-b045-8b803afd4848', 'c0936de6-6acb-4a3a-9f3e-6ceb8386ef39', 'b159162e-01a1-4bb5-8dc4-07d4ec0e8862') AND status = 'active';  -- 기대 0
