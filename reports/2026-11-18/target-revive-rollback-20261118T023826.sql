-- target-revive 롤백 20261118T023826 — 7행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('43dfd24c-afbf-4476-8bd7-604938566ac5'::uuid, 'exhausted', 30),
  ('00075f08-91c1-4874-94ca-583a84b341eb'::uuid, 'exhausted', 2),
  ('a68510c4-4b79-4ecd-94f3-f48a4131c4c9'::uuid, 'exhausted', 0),
  ('960b4292-436e-45b0-bae2-08bb8f6d1702'::uuid, 'exhausted', 1),
  ('9ed187b2-7100-4b08-a56d-4b73149624ee'::uuid, 'exhausted', 0),
  ('43059bc7-b84d-40b3-9751-740e6b08be01'::uuid, 'exhausted', 0),
  ('f1869730-8b11-4371-a457-f99af3112d1f'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('43dfd24c-afbf-4476-8bd7-604938566ac5', '00075f08-91c1-4874-94ca-583a84b341eb', 'a68510c4-4b79-4ecd-94f3-f48a4131c4c9', '960b4292-436e-45b0-bae2-08bb8f6d1702', '9ed187b2-7100-4b08-a56d-4b73149624ee', '43059bc7-b84d-40b3-9751-740e6b08be01', 'f1869730-8b11-4371-a457-f99af3112d1f') AND status = 'active';  -- 기대 0
