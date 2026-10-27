-- target-revive 롤백 20261027T065124 — 7행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('0a93c5f6-3bdb-4ce6-9951-7b7c69ea55c9'::uuid, 'exhausted', 3),
  ('1677db23-90b9-4a92-bca0-21e1e9415cbf'::uuid, 'exhausted', 0),
  ('a2fcfc9a-c330-4b85-91cc-b4890e03f96f'::uuid, 'exhausted', 0),
  ('759acbc0-17fd-4bc9-82ff-2777af2fb90f'::uuid, 'exhausted', 0),
  ('0fb6809d-406e-4c92-96da-419e0e3bf3ad'::uuid, 'exhausted', 0),
  ('771ccee3-1f19-40d8-a0bc-1b2c0e6bf4d2'::uuid, 'exhausted', 0),
  ('94708bc4-96f3-429c-92de-3e46205fa210'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('0a93c5f6-3bdb-4ce6-9951-7b7c69ea55c9', '1677db23-90b9-4a92-bca0-21e1e9415cbf', 'a2fcfc9a-c330-4b85-91cc-b4890e03f96f', '759acbc0-17fd-4bc9-82ff-2777af2fb90f', '0fb6809d-406e-4c92-96da-419e0e3bf3ad', '771ccee3-1f19-40d8-a0bc-1b2c0e6bf4d2', '94708bc4-96f3-429c-92de-3e46205fa210') AND status = 'active';  -- 기대 0
