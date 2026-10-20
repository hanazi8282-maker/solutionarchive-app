-- target-revive 롤백 20261019T235722 — 6행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('68e23c87-23de-4dc3-a70a-2b8e6b0fb944'::uuid, 'exhausted', 0),
  ('19bc2c00-2518-448f-9cfe-7073704d927d'::uuid, 'exhausted', 0),
  ('63b75d14-8dfc-4971-b469-14175ee14193'::uuid, 'exhausted', 1),
  ('e2ba601b-b251-4380-beaa-ecb615e56c74'::uuid, 'exhausted', 1),
  ('998e297a-9af5-4368-a9bc-a485ee8d7354'::uuid, 'exhausted', 1),
  ('22b3e5e4-fd9a-4d9e-bec9-5c3970ed3974'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('68e23c87-23de-4dc3-a70a-2b8e6b0fb944', '19bc2c00-2518-448f-9cfe-7073704d927d', '63b75d14-8dfc-4971-b469-14175ee14193', 'e2ba601b-b251-4380-beaa-ecb615e56c74', '998e297a-9af5-4368-a9bc-a485ee8d7354', '22b3e5e4-fd9a-4d9e-bec9-5c3970ed3974') AND status = 'active';  -- 기대 0
