-- target-revive 롤백 20261031T073155 — 6행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('cbaf404e-71d6-45e7-8764-8ecc484c5a05'::uuid, 'exhausted', 1),
  ('8984a16c-c0ec-4919-aef4-3d2e6057c520'::uuid, 'exhausted', 1),
  ('609f863b-16a6-49eb-9e67-06ba5a9ee176'::uuid, 'exhausted', 0),
  ('64f37a15-2d9e-4614-8716-024dfaa2d629'::uuid, 'exhausted', 1),
  ('526db6a3-ff15-4a18-97b3-47d8c3b40239'::uuid, 'exhausted', 0),
  ('f429f02b-8cd9-412c-b0a5-9aef1c7d65cf'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('cbaf404e-71d6-45e7-8764-8ecc484c5a05', '8984a16c-c0ec-4919-aef4-3d2e6057c520', '609f863b-16a6-49eb-9e67-06ba5a9ee176', '64f37a15-2d9e-4614-8716-024dfaa2d629', '526db6a3-ff15-4a18-97b3-47d8c3b40239', 'f429f02b-8cd9-412c-b0a5-9aef1c7d65cf') AND status = 'active';  -- 기대 0
