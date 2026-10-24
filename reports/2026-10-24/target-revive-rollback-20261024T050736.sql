-- target-revive 롤백 20261024T050736 — 3행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('a56aaa5e-c29b-43d4-a0ec-37f02a21bc4f'::uuid, 'exhausted', 30),
  ('32b133d9-b3f4-45da-acc6-0741342b994d'::uuid, 'exhausted', 3),
  ('11d168fc-fb2c-4334-b800-0beb6e7303bf'::uuid, 'exhausted', 11)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('a56aaa5e-c29b-43d4-a0ec-37f02a21bc4f', '32b133d9-b3f4-45da-acc6-0741342b994d', '11d168fc-fb2c-4334-b800-0beb6e7303bf') AND status = 'active';  -- 기대 0
