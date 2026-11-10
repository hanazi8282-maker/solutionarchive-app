-- target-revive 롤백 20261110T085103 — 7행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('a0ea7b58-2bcf-40a3-b409-72e4ee30137c'::uuid, 'exhausted', 0),
  ('2d543037-30f5-43c8-bed4-6360d3066432'::uuid, 'exhausted', 0),
  ('25583880-8a30-4424-bb03-8741d3fa035c'::uuid, 'exhausted', 0),
  ('06653e11-de84-48f2-8a52-10713ce1783d'::uuid, 'exhausted', 0),
  ('c57416c7-1851-4a13-a6ce-3edc733b49f9'::uuid, 'exhausted', 0),
  ('4618226e-1654-43a1-9428-6b2c8c804630'::uuid, 'exhausted', 0),
  ('64d1242d-48be-432f-b632-7d9cb586507c'::uuid, 'exhausted', 3)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('a0ea7b58-2bcf-40a3-b409-72e4ee30137c', '2d543037-30f5-43c8-bed4-6360d3066432', '25583880-8a30-4424-bb03-8741d3fa035c', '06653e11-de84-48f2-8a52-10713ce1783d', 'c57416c7-1851-4a13-a6ce-3edc733b49f9', '4618226e-1654-43a1-9428-6b2c8c804630', '64d1242d-48be-432f-b632-7d9cb586507c') AND status = 'active';  -- 기대 0
