-- target-revive 롤백 20261027T184437 — 6행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('d460e358-1501-4d26-a0bc-7e5ba0549711'::uuid, 'exhausted', 1),
  ('a5d2139a-561c-4f0f-844e-960e0c63d424'::uuid, 'exhausted', 1),
  ('ce829cb1-0694-4c6c-9f55-e54946e115ac'::uuid, 'exhausted', 1),
  ('c37b3b17-d8f7-4af6-b8b3-00d3a7e4d303'::uuid, 'exhausted', 1),
  ('c8cc1313-0924-46f2-b0cf-c12d0633a43c'::uuid, 'exhausted', 1),
  ('bdc96252-f353-4cba-add2-88f8ad3f7533'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('d460e358-1501-4d26-a0bc-7e5ba0549711', 'a5d2139a-561c-4f0f-844e-960e0c63d424', 'ce829cb1-0694-4c6c-9f55-e54946e115ac', 'c37b3b17-d8f7-4af6-b8b3-00d3a7e4d303', 'c8cc1313-0924-46f2-b0cf-c12d0633a43c', 'bdc96252-f353-4cba-add2-88f8ad3f7533') AND status = 'active';  -- 기대 0
