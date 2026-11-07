-- target-revive 롤백 20261107T210403 — 8행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('f24be87a-de8a-407b-b2f0-fe75470101e8'::uuid, 'exhausted', 4),
  ('729cce7a-cdf8-414e-8d40-821a91705618'::uuid, 'exhausted', 4),
  ('ddb13e08-76fa-4685-bb65-e4d5c43d9af4'::uuid, 'exhausted', 0),
  ('50e0d842-6fae-46d9-a182-a22f810815c7'::uuid, 'exhausted', 1),
  ('64adba38-d95d-428b-9ba5-82819a722a47'::uuid, 'exhausted', 1),
  ('a6cc2751-1554-4491-8ee1-6451245fc4d0'::uuid, 'exhausted', 1),
  ('130844ba-249e-4e27-8acb-f667962b19ae'::uuid, 'exhausted', 0),
  ('4fbaa9a1-edcb-45e3-b898-101758fff161'::uuid, 'exhausted', 3)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('f24be87a-de8a-407b-b2f0-fe75470101e8', '729cce7a-cdf8-414e-8d40-821a91705618', 'ddb13e08-76fa-4685-bb65-e4d5c43d9af4', '50e0d842-6fae-46d9-a182-a22f810815c7', '64adba38-d95d-428b-9ba5-82819a722a47', 'a6cc2751-1554-4491-8ee1-6451245fc4d0', '130844ba-249e-4e27-8acb-f667962b19ae', '4fbaa9a1-edcb-45e3-b898-101758fff161') AND status = 'active';  -- 기대 0
