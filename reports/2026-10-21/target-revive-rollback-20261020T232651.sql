-- target-revive 롤백 20261020T232651 — 6행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('e15e20ea-d45b-4116-ac4f-bb87699b28b8'::uuid, 'exhausted', 0),
  ('fb61b71c-7e00-4814-9414-2cc82970138f'::uuid, 'exhausted', 1),
  ('576ed7f6-3c8e-41c9-b2ec-7fd367a2de21'::uuid, 'exhausted', 1),
  ('dfd23d2e-63ea-4e6c-8ce3-9513cf5676dd'::uuid, 'exhausted', 0),
  ('36ec9b41-c5c8-42f9-9c58-f6ce5776cdd6'::uuid, 'exhausted', 1),
  ('55ebf8aa-a3c7-4467-b238-edcf878e00c2'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('e15e20ea-d45b-4116-ac4f-bb87699b28b8', 'fb61b71c-7e00-4814-9414-2cc82970138f', '576ed7f6-3c8e-41c9-b2ec-7fd367a2de21', 'dfd23d2e-63ea-4e6c-8ce3-9513cf5676dd', '36ec9b41-c5c8-42f9-9c58-f6ce5776cdd6', '55ebf8aa-a3c7-4467-b238-edcf878e00c2') AND status = 'active';  -- 기대 0
