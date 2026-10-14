-- target-revive 롤백 20261014T103456 — 3행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('6d33ce10-5c52-419a-8d6a-26bc37f938dd'::uuid, 'exhausted', 0),
  ('f16d1cd5-e03b-4d62-b612-417e96194c3a'::uuid, 'exhausted', 0),
  ('fefc84f5-45e6-4a15-a09f-1a4f36c4effc'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('6d33ce10-5c52-419a-8d6a-26bc37f938dd', 'f16d1cd5-e03b-4d62-b612-417e96194c3a', 'fefc84f5-45e6-4a15-a09f-1a4f36c4effc') AND status = 'active';  -- 기대 0
