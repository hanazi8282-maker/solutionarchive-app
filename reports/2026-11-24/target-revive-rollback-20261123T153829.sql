-- target-revive 롤백 20261123T153829 — 5행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('caa94fe9-c16c-428c-a8b3-1382181dac10'::uuid, 'exhausted', 2),
  ('9002d842-6f38-4d28-b4ac-0654785f76ec'::uuid, 'exhausted', 3),
  ('c4028ed8-b821-4954-8f6f-e7e2d5ad02fe'::uuid, 'exhausted', 0),
  ('31345884-1ed0-444b-b0e5-5374cd179dda'::uuid, 'exhausted', 0),
  ('6d5e4f00-6ac6-48f5-bffa-5cde76d10743'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('caa94fe9-c16c-428c-a8b3-1382181dac10', '9002d842-6f38-4d28-b4ac-0654785f76ec', 'c4028ed8-b821-4954-8f6f-e7e2d5ad02fe', '31345884-1ed0-444b-b0e5-5374cd179dda', '6d5e4f00-6ac6-48f5-bffa-5cde76d10743') AND status = 'active';  -- 기대 0
