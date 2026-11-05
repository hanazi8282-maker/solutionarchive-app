-- target-revive 롤백 20261105T010519 — 4행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('faebb72b-ef11-4a1b-9b6b-16c7bbb0c2b0'::uuid, 'exhausted', 30),
  ('ac926c78-6da2-4eec-af1e-9d307433f936'::uuid, 'exhausted', 3),
  ('e685b67f-252e-4654-a677-8be9cf943fbe'::uuid, 'exhausted', 3),
  ('749b314f-244f-4883-a9b3-0b403c2f78f2'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('faebb72b-ef11-4a1b-9b6b-16c7bbb0c2b0', 'ac926c78-6da2-4eec-af1e-9d307433f936', 'e685b67f-252e-4654-a677-8be9cf943fbe', '749b314f-244f-4883-a9b3-0b403c2f78f2') AND status = 'active';  -- 기대 0
