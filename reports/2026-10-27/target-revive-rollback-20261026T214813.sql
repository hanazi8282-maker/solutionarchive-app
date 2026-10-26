-- target-revive 롤백 20261026T214813 — 7행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('27caa69e-90ca-4fd0-9207-700964f10a63'::uuid, 'exhausted', 3),
  ('f0a8c81e-5cc0-4e92-96fc-a75aceb5eb33'::uuid, 'exhausted', 1),
  ('1d9c0709-d9b3-4736-896c-2d62c09ba013'::uuid, 'exhausted', 1),
  ('4ccfbd4d-6df1-48b2-bd31-1fd18efda7da'::uuid, 'exhausted', 1),
  ('558f2844-4c74-4367-a03f-8f9cb647ff86'::uuid, 'exhausted', 1),
  ('7ca08717-4460-4a5f-8566-ac2f3dfa14a5'::uuid, 'exhausted', 1),
  ('f03680a2-aea0-4d32-b1a7-68443e34e3aa'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('27caa69e-90ca-4fd0-9207-700964f10a63', 'f0a8c81e-5cc0-4e92-96fc-a75aceb5eb33', '1d9c0709-d9b3-4736-896c-2d62c09ba013', '4ccfbd4d-6df1-48b2-bd31-1fd18efda7da', '558f2844-4c74-4367-a03f-8f9cb647ff86', '7ca08717-4460-4a5f-8566-ac2f3dfa14a5', 'f03680a2-aea0-4d32-b1a7-68443e34e3aa') AND status = 'active';  -- 기대 0
