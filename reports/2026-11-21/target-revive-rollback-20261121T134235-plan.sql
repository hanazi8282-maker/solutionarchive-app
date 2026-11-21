-- target-revive 롤백 20261121T134235 — 3행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('143a81d3-6ab1-4d3f-8844-d13259be5cf5'::uuid, 'exhausted', 10),
  ('11d168fc-fb2c-4334-b800-0beb6e7303bf'::uuid, 'exhausted', 13),
  ('3ee0f078-d052-43db-a51a-df8bca20e4dd'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('143a81d3-6ab1-4d3f-8844-d13259be5cf5', '11d168fc-fb2c-4334-b800-0beb6e7303bf', '3ee0f078-d052-43db-a51a-df8bca20e4dd') AND status = 'active';  -- 기대 0
