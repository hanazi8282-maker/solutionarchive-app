-- target-revive 롤백 20261101T161031 — 7행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('bb5fe11d-78e5-4bad-8394-b3efccf5e82e'::uuid, 'exhausted', 3),
  ('bf2fa2bb-e54d-46b1-b8a2-f08738c8f9b8'::uuid, 'exhausted', 1),
  ('b7be79e6-4eca-45dd-9dcd-14a5566e736d'::uuid, 'exhausted', 1),
  ('fe20dcbf-d495-48e1-96f8-3d07aaca584c'::uuid, 'exhausted', 1),
  ('dcc7bd67-82ec-4c7e-a143-6a22cec9465c'::uuid, 'exhausted', 1),
  ('5d986b0f-1dd2-4eaf-bada-920830495c34'::uuid, 'exhausted', 1),
  ('2624f52b-1afe-4633-9e7e-ff15785b55e3'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('bb5fe11d-78e5-4bad-8394-b3efccf5e82e', 'bf2fa2bb-e54d-46b1-b8a2-f08738c8f9b8', 'b7be79e6-4eca-45dd-9dcd-14a5566e736d', 'fe20dcbf-d495-48e1-96f8-3d07aaca584c', 'dcc7bd67-82ec-4c7e-a143-6a22cec9465c', '5d986b0f-1dd2-4eaf-bada-920830495c34', '2624f52b-1afe-4633-9e7e-ff15785b55e3') AND status = 'active';  -- 기대 0
