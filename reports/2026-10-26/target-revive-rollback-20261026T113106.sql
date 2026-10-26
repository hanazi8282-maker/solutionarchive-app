-- target-revive 롤백 20261026T113106 — 8행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('3871f508-a7c5-40b9-a9f9-8f974041fe9e'::uuid, 'exhausted', 3),
  ('9002d842-6f38-4d28-b4ac-0654785f76ec'::uuid, 'exhausted', 1),
  ('fefc84f5-45e6-4a15-a09f-1a4f36c4effc'::uuid, 'exhausted', 0),
  ('2becd148-534c-4998-8ba5-96d229753f35'::uuid, 'exhausted', 0),
  ('68f9ec02-97e8-4c3b-a13d-3fca9d37d564'::uuid, 'exhausted', 0),
  ('9b3297a4-d189-4342-afc0-31209bbc025f'::uuid, 'exhausted', 1),
  ('eaeff3fc-3aa5-496b-9dc8-b9ee511fa0c1'::uuid, 'exhausted', 1),
  ('e5299fd3-b630-40c2-83c0-2abcdb86bad1'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('3871f508-a7c5-40b9-a9f9-8f974041fe9e', '9002d842-6f38-4d28-b4ac-0654785f76ec', 'fefc84f5-45e6-4a15-a09f-1a4f36c4effc', '2becd148-534c-4998-8ba5-96d229753f35', '68f9ec02-97e8-4c3b-a13d-3fca9d37d564', '9b3297a4-d189-4342-afc0-31209bbc025f', 'eaeff3fc-3aa5-496b-9dc8-b9ee511fa0c1', 'e5299fd3-b630-40c2-83c0-2abcdb86bad1') AND status = 'active';  -- 기대 0
