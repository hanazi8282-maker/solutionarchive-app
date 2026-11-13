-- target-revive 롤백 20261113T224934 — 2행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('89c26dd5-53ea-44a5-882c-be2da796a6a9'::uuid, 'exhausted', 4),
  ('8cee7596-9be1-4e1e-b9da-65503e3bf005'::uuid, 'exhausted', 3)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('89c26dd5-53ea-44a5-882c-be2da796a6a9', '8cee7596-9be1-4e1e-b9da-65503e3bf005') AND status = 'active';  -- 기대 0
