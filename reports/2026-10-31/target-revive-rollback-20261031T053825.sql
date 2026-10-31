-- target-revive 롤백 20261031T053825 — 6행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('add671ab-0eaf-4d26-a8a9-237048939e77'::uuid, 'exhausted', 1),
  ('070198c8-ebee-4238-94a6-28d490967d8a'::uuid, 'exhausted', 1),
  ('6c500d96-997d-425b-a698-857ef1a843e8'::uuid, 'exhausted', 1),
  ('66870f62-7f08-4d6a-af8a-1535bba94f62'::uuid, 'exhausted', 1),
  ('fc7dd60a-1230-4fca-a49e-63b2b38ea39e'::uuid, 'exhausted', 1),
  ('5fc59408-7325-4607-ac65-ed3cc4c683d8'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('add671ab-0eaf-4d26-a8a9-237048939e77', '070198c8-ebee-4238-94a6-28d490967d8a', '6c500d96-997d-425b-a698-857ef1a843e8', '66870f62-7f08-4d6a-af8a-1535bba94f62', 'fc7dd60a-1230-4fca-a49e-63b2b38ea39e', '5fc59408-7325-4607-ac65-ed3cc4c683d8') AND status = 'active';  -- 기대 0
