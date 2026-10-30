-- target-revive 롤백 20261030T183934 — 6행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('e1804d14-9515-48aa-9be8-b90ab86807e0'::uuid, 'exhausted', 0),
  ('afd88daa-5b0f-4970-8618-cc23689757be'::uuid, 'exhausted', 1),
  ('86f0c58f-dd02-4213-9d68-dfbbe809ab09'::uuid, 'exhausted', 1),
  ('8f19f5f9-6ce6-4a04-a124-be60a04b733d'::uuid, 'exhausted', 1),
  ('3e5c1129-b5a2-4c39-b228-8a12fba92bed'::uuid, 'exhausted', 1),
  ('86e293ce-5cad-4605-baf4-4a1b5856128c'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('e1804d14-9515-48aa-9be8-b90ab86807e0', 'afd88daa-5b0f-4970-8618-cc23689757be', '86f0c58f-dd02-4213-9d68-dfbbe809ab09', '8f19f5f9-6ce6-4a04-a124-be60a04b733d', '3e5c1129-b5a2-4c39-b228-8a12fba92bed', '86e293ce-5cad-4605-baf4-4a1b5856128c') AND status = 'active';  -- 기대 0
