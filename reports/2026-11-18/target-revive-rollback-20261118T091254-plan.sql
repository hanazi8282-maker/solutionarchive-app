-- target-revive 롤백 20261118T091254 — 8행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('50d27782-19a1-40b4-ac50-9ecbbba53886'::uuid, 'exhausted', 0),
  ('8d1f5dc7-f8c0-4a85-ac35-46ec04014474'::uuid, 'exhausted', 0),
  ('e1804d14-9515-48aa-9be8-b90ab86807e0'::uuid, 'exhausted', 0),
  ('afd88daa-5b0f-4970-8618-cc23689757be'::uuid, 'exhausted', 0),
  ('86f0c58f-dd02-4213-9d68-dfbbe809ab09'::uuid, 'exhausted', 0),
  ('8f19f5f9-6ce6-4a04-a124-be60a04b733d'::uuid, 'exhausted', 0),
  ('860442ac-6d63-4caf-b8bf-cb30e2038c6f'::uuid, 'exhausted', 3),
  ('8cee7596-9be1-4e1e-b9da-65503e3bf005'::uuid, 'exhausted', 3)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('50d27782-19a1-40b4-ac50-9ecbbba53886', '8d1f5dc7-f8c0-4a85-ac35-46ec04014474', 'e1804d14-9515-48aa-9be8-b90ab86807e0', 'afd88daa-5b0f-4970-8618-cc23689757be', '86f0c58f-dd02-4213-9d68-dfbbe809ab09', '8f19f5f9-6ce6-4a04-a124-be60a04b733d', '860442ac-6d63-4caf-b8bf-cb30e2038c6f', '8cee7596-9be1-4e1e-b9da-65503e3bf005') AND status = 'active';  -- 기대 0
