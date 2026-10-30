-- target-revive 롤백 20261030T113557 — 8행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('91b93d08-0281-4439-b2af-dc3ae777c9bf'::uuid, 'exhausted', 3),
  ('ffbee427-90b0-4caa-a515-4a98b0928a25'::uuid, 'exhausted', 3),
  ('a68510c4-4b79-4ecd-94f3-f48a4131c4c9'::uuid, 'exhausted', 1),
  ('960b4292-436e-45b0-bae2-08bb8f6d1702'::uuid, 'exhausted', 0),
  ('9ed187b2-7100-4b08-a56d-4b73149624ee'::uuid, 'exhausted', 1),
  ('43059bc7-b84d-40b3-9751-740e6b08be01'::uuid, 'exhausted', 1),
  ('f1869730-8b11-4371-a457-f99af3112d1f'::uuid, 'exhausted', 1),
  ('f434a6d7-85ce-4722-9ee2-286fdeb46497'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('91b93d08-0281-4439-b2af-dc3ae777c9bf', 'ffbee427-90b0-4caa-a515-4a98b0928a25', 'a68510c4-4b79-4ecd-94f3-f48a4131c4c9', '960b4292-436e-45b0-bae2-08bb8f6d1702', '9ed187b2-7100-4b08-a56d-4b73149624ee', '43059bc7-b84d-40b3-9751-740e6b08be01', 'f1869730-8b11-4371-a457-f99af3112d1f', 'f434a6d7-85ce-4722-9ee2-286fdeb46497') AND status = 'active';  -- 기대 0
