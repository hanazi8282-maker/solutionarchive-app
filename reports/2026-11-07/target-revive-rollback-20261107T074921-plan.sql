-- target-revive 롤백 20261107T074921 — 7행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('e3ee01f9-f252-4260-915f-5e4238450000'::uuid, 'exhausted', 0),
  ('66239563-a8dc-470a-8d4a-5477e0e5fa94'::uuid, 'exhausted', 0),
  ('422ef941-5dee-4939-b4e1-22bb0ca71249'::uuid, 'exhausted', 0),
  ('66ff53db-d7c9-46ee-a83a-8376a3530abc'::uuid, 'exhausted', 0),
  ('164a2938-a2a7-407e-996f-bb828a185829'::uuid, 'exhausted', 1),
  ('65c5cbb9-3d71-418b-860b-1f9672fd818a'::uuid, 'exhausted', 3),
  ('3ee0f078-d052-43db-a51a-df8bca20e4dd'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('e3ee01f9-f252-4260-915f-5e4238450000', '66239563-a8dc-470a-8d4a-5477e0e5fa94', '422ef941-5dee-4939-b4e1-22bb0ca71249', '66ff53db-d7c9-46ee-a83a-8376a3530abc', '164a2938-a2a7-407e-996f-bb828a185829', '65c5cbb9-3d71-418b-860b-1f9672fd818a', '3ee0f078-d052-43db-a51a-df8bca20e4dd') AND status = 'active';  -- 기대 0
