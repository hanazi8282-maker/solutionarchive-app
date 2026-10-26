-- target-revive 롤백 20261026T192320 — 6행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('34c092f3-387b-44ab-9a59-c468e5721e08'::uuid, 'exhausted', 0),
  ('affe5af6-c136-4214-a662-cc135cd3ceb1'::uuid, 'exhausted', 0),
  ('79d61e0b-569b-48e2-8202-d6d620cb765d'::uuid, 'exhausted', 0),
  ('21f4a66c-8a2b-4e76-ad69-429ee66a7f67'::uuid, 'exhausted', 0),
  ('d390ef97-49cc-4ea1-b739-2ad712053841'::uuid, 'exhausted', 0),
  ('4694f74f-d8a8-4b64-abe9-00593c113195'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('34c092f3-387b-44ab-9a59-c468e5721e08', 'affe5af6-c136-4214-a662-cc135cd3ceb1', '79d61e0b-569b-48e2-8202-d6d620cb765d', '21f4a66c-8a2b-4e76-ad69-429ee66a7f67', 'd390ef97-49cc-4ea1-b739-2ad712053841', '4694f74f-d8a8-4b64-abe9-00593c113195') AND status = 'active';  -- 기대 0
