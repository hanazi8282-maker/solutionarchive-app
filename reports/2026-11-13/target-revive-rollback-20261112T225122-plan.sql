-- target-revive 롤백 20261112T225122 — 6행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('ce829cb1-0694-4c6c-9f55-e54946e115ac'::uuid, 'exhausted', 0),
  ('c37b3b17-d8f7-4af6-b8b3-00d3a7e4d303'::uuid, 'exhausted', 0),
  ('c8cc1313-0924-46f2-b0cf-c12d0633a43c'::uuid, 'exhausted', 0),
  ('bdc96252-f353-4cba-add2-88f8ad3f7533'::uuid, 'exhausted', 0),
  ('a8efd6f5-d22a-4aca-8475-e4c4e9e13abb'::uuid, 'exhausted', 0),
  ('5122c07a-7160-49d3-a08b-9d9ec90d2f75'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('ce829cb1-0694-4c6c-9f55-e54946e115ac', 'c37b3b17-d8f7-4af6-b8b3-00d3a7e4d303', 'c8cc1313-0924-46f2-b0cf-c12d0633a43c', 'bdc96252-f353-4cba-add2-88f8ad3f7533', 'a8efd6f5-d22a-4aca-8475-e4c4e9e13abb', '5122c07a-7160-49d3-a08b-9d9ec90d2f75') AND status = 'active';  -- 기대 0
