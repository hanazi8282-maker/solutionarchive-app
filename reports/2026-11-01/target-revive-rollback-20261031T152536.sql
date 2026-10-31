-- target-revive 롤백 20261031T152536 — 9행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('93182cc7-9a17-43da-975d-889af1db9fb1'::uuid, 'exhausted', 3),
  ('79c4733e-df04-4757-a8df-a97a7b51761d'::uuid, 'exhausted', 3),
  ('47e99421-f9b9-4e9e-8d1b-66b0e5b33cc8'::uuid, 'exhausted', 3),
  ('fcd97548-b8ac-4d70-8b1e-faccff315fb1'::uuid, 'exhausted', 1),
  ('3d75619f-5bfd-4cb4-8ceb-fcb614488095'::uuid, 'exhausted', 0),
  ('68e23c87-23de-4dc3-a70a-2b8e6b0fb944'::uuid, 'exhausted', 1),
  ('19bc2c00-2518-448f-9cfe-7073704d927d'::uuid, 'exhausted', 1),
  ('63b75d14-8dfc-4971-b469-14175ee14193'::uuid, 'exhausted', 2),
  ('e2ba601b-b251-4380-beaa-ecb615e56c74'::uuid, 'exhausted', 2)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('93182cc7-9a17-43da-975d-889af1db9fb1', '79c4733e-df04-4757-a8df-a97a7b51761d', '47e99421-f9b9-4e9e-8d1b-66b0e5b33cc8', 'fcd97548-b8ac-4d70-8b1e-faccff315fb1', '3d75619f-5bfd-4cb4-8ceb-fcb614488095', '68e23c87-23de-4dc3-a70a-2b8e6b0fb944', '19bc2c00-2518-448f-9cfe-7073704d927d', '63b75d14-8dfc-4971-b469-14175ee14193', 'e2ba601b-b251-4380-beaa-ecb615e56c74') AND status = 'active';  -- 기대 0
