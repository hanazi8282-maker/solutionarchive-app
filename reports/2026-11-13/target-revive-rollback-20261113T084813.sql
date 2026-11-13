-- target-revive 롤백 20261113T084813 — 8행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('7a8996d5-ed2f-4558-a826-dd06ce6d1e12'::uuid, 'exhausted', 3),
  ('1e92a901-740d-426e-ad16-046e4e6330e7'::uuid, 'exhausted', 2),
  ('5c44b723-2c33-4057-9190-9bc7eca6ccc9'::uuid, 'exhausted', 0),
  ('e9b7e398-278a-4e7a-8e54-c1d30c361716'::uuid, 'exhausted', 2),
  ('1abe44ac-c905-4efd-8d09-8b92b3bfbe1a'::uuid, 'exhausted', 2),
  ('46e698fb-b5b7-4c98-9d5d-c4c4679f5b05'::uuid, 'exhausted', 2),
  ('b4109e76-745b-48cc-b67d-6fb86286696d'::uuid, 'exhausted', 1),
  ('c6c1c231-ffbf-4cee-9b14-68a0b61a8166'::uuid, 'exhausted', 3)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('7a8996d5-ed2f-4558-a826-dd06ce6d1e12', '1e92a901-740d-426e-ad16-046e4e6330e7', '5c44b723-2c33-4057-9190-9bc7eca6ccc9', 'e9b7e398-278a-4e7a-8e54-c1d30c361716', '1abe44ac-c905-4efd-8d09-8b92b3bfbe1a', '46e698fb-b5b7-4c98-9d5d-c4c4679f5b05', 'b4109e76-745b-48cc-b67d-6fb86286696d', 'c6c1c231-ffbf-4cee-9b14-68a0b61a8166') AND status = 'active';  -- 기대 0
