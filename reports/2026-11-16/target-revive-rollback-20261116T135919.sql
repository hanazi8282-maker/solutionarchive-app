-- target-revive 롤백 20261116T135919 — 5행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('13f04527-59c9-45ca-92e0-248c06dd01b0'::uuid, 'exhausted', 1),
  ('3ac60ed3-1cb6-4d31-bf27-476b8789de85'::uuid, 'exhausted', 1),
  ('4820e865-948f-43ba-b3ea-740fa9e0c76f'::uuid, 'exhausted', 1),
  ('2d981709-7c6e-4739-8aec-d25e8ea12ef9'::uuid, 'exhausted', 1),
  ('6c1eaa98-6c4c-4196-8441-8b7e05b23ed9'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('13f04527-59c9-45ca-92e0-248c06dd01b0', '3ac60ed3-1cb6-4d31-bf27-476b8789de85', '4820e865-948f-43ba-b3ea-740fa9e0c76f', '2d981709-7c6e-4739-8aec-d25e8ea12ef9', '6c1eaa98-6c4c-4196-8441-8b7e05b23ed9') AND status = 'active';  -- 기대 0
