-- target-revive 롤백 20261112T135853 — 7행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('a93386ca-6c23-4036-b490-0f1764eb6f94'::uuid, 'exhausted', 4),
  ('e78062b4-1d9a-4aed-904a-ac850e273554'::uuid, 'exhausted', 4),
  ('771ccee3-1f19-40d8-a0bc-1b2c0e6bf4d2'::uuid, 'exhausted', 1),
  ('94708bc4-96f3-429c-92de-3e46205fa210'::uuid, 'exhausted', 1),
  ('899f5eae-252b-453a-b2d6-42f48d959fdf'::uuid, 'exhausted', 0),
  ('d143dc65-23e1-4476-b017-78c009bd6f07'::uuid, 'exhausted', 1),
  ('a90b47fb-8473-4cfd-8e01-f1182afcbd6f'::uuid, 'exhausted', 4)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('a93386ca-6c23-4036-b490-0f1764eb6f94', 'e78062b4-1d9a-4aed-904a-ac850e273554', '771ccee3-1f19-40d8-a0bc-1b2c0e6bf4d2', '94708bc4-96f3-429c-92de-3e46205fa210', '899f5eae-252b-453a-b2d6-42f48d959fdf', 'd143dc65-23e1-4476-b017-78c009bd6f07', 'a90b47fb-8473-4cfd-8e01-f1182afcbd6f') AND status = 'active';  -- 기대 0
