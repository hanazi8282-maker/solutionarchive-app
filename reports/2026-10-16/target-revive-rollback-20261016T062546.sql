-- target-revive 롤백 20261016T062546 — 4행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('0a2e35cf-84a7-4636-8fa8-85ef4d7b216a'::uuid, 'exhausted', 3),
  ('138c3c5f-5fa3-4cc5-bba5-467ddb076afc'::uuid, 'exhausted', 3),
  ('9f9f9a15-cb79-4ea6-9540-cb538e5ad290'::uuid, 'exhausted', 3),
  ('8670d507-ee7e-4444-8ae7-497e4ec52767'::uuid, 'exhausted', 3)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('0a2e35cf-84a7-4636-8fa8-85ef4d7b216a', '138c3c5f-5fa3-4cc5-bba5-467ddb076afc', '9f9f9a15-cb79-4ea6-9540-cb538e5ad290', '8670d507-ee7e-4444-8ae7-497e4ec52767') AND status = 'active';  -- 기대 0
