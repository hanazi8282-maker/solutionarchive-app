-- target-revive 롤백 20261018T095223 — 6행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('1ccd47ca-7e91-4e6d-8ea9-2d6d4974f1cb'::uuid, 'exhausted', 0),
  ('d40d3c29-1de4-4b05-b37b-6cf235993088'::uuid, 'exhausted', 0),
  ('f92867b3-e0fd-4ad3-ae1a-34fcaae69c9f'::uuid, 'exhausted', 0),
  ('8087b231-642f-40fb-b9d5-12bd9002085e'::uuid, 'exhausted', 0),
  ('f06b4d91-91d7-40a7-b3b1-5468cdbfd5b2'::uuid, 'exhausted', 0),
  ('50e690c7-1368-4a4d-b8a8-26200c122f20'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('1ccd47ca-7e91-4e6d-8ea9-2d6d4974f1cb', 'd40d3c29-1de4-4b05-b37b-6cf235993088', 'f92867b3-e0fd-4ad3-ae1a-34fcaae69c9f', '8087b231-642f-40fb-b9d5-12bd9002085e', 'f06b4d91-91d7-40a7-b3b1-5468cdbfd5b2', '50e690c7-1368-4a4d-b8a8-26200c122f20') AND status = 'active';  -- 기대 0
