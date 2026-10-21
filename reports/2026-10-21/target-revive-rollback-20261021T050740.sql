-- target-revive 롤백 20261021T050740 — 2행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('cae7f5e8-1186-45cb-9852-fe0435acc8e1'::uuid, 'exhausted', 1),
  ('d912a98b-33ed-4404-a527-90f1c0e92e77'::uuid, 'exhausted', 3)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('cae7f5e8-1186-45cb-9852-fe0435acc8e1', 'd912a98b-33ed-4404-a527-90f1c0e92e77') AND status = 'active';  -- 기대 0
