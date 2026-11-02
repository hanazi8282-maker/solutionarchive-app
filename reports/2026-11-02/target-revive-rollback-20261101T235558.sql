-- target-revive 롤백 20261101T235558 — 7행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('749b314f-244f-4883-a9b3-0b403c2f78f2'::uuid, 'exhausted', 0),
  ('2e87f9d1-e5d5-427f-8a14-9fac8ea48a37'::uuid, 'exhausted', 1),
  ('9827c3cf-178c-4fa2-843c-a14a8ac2880d'::uuid, 'exhausted', 1),
  ('338216f4-5af0-4afc-825e-16f635738802'::uuid, 'exhausted', 1),
  ('e15e20ea-d45b-4116-ac4f-bb87699b28b8'::uuid, 'exhausted', 1),
  ('fb61b71c-7e00-4814-9414-2cc82970138f'::uuid, 'exhausted', 2),
  ('576ed7f6-3c8e-41c9-b2ec-7fd367a2de21'::uuid, 'exhausted', 2)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('749b314f-244f-4883-a9b3-0b403c2f78f2', '2e87f9d1-e5d5-427f-8a14-9fac8ea48a37', '9827c3cf-178c-4fa2-843c-a14a8ac2880d', '338216f4-5af0-4afc-825e-16f635738802', 'e15e20ea-d45b-4116-ac4f-bb87699b28b8', 'fb61b71c-7e00-4814-9414-2cc82970138f', '576ed7f6-3c8e-41c9-b2ec-7fd367a2de21') AND status = 'active';  -- 기대 0
