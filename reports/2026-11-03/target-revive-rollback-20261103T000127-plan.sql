-- target-revive 롤백 20261103T000127 — 8행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('2f85b368-9040-49a9-8aba-95913a49c024'::uuid, 'exhausted', 3),
  ('0a2863aa-9463-448b-bb32-318dfab88b6e'::uuid, 'exhausted', 1),
  ('49a3914e-2377-400c-9177-e15873b916a4'::uuid, 'exhausted', 1),
  ('febe49d7-8978-46d0-972d-4dd523f2c454'::uuid, 'exhausted', 1),
  ('ea6cc496-a4bd-4a57-a620-0c7012e84825'::uuid, 'exhausted', 1),
  ('07680ca3-d001-42ff-8e22-ad8f8700b2be'::uuid, 'exhausted', 1),
  ('a4f70f65-e5c0-4f0d-921b-1543acde9f9b'::uuid, 'exhausted', 1),
  ('65c5cbb9-3d71-418b-860b-1f9672fd818a'::uuid, 'exhausted', 3)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('2f85b368-9040-49a9-8aba-95913a49c024', '0a2863aa-9463-448b-bb32-318dfab88b6e', '49a3914e-2377-400c-9177-e15873b916a4', 'febe49d7-8978-46d0-972d-4dd523f2c454', 'ea6cc496-a4bd-4a57-a620-0c7012e84825', '07680ca3-d001-42ff-8e22-ad8f8700b2be', 'a4f70f65-e5c0-4f0d-921b-1543acde9f9b', '65c5cbb9-3d71-418b-860b-1f9672fd818a') AND status = 'active';  -- 기대 0
