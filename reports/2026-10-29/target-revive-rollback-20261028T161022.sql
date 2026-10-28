-- target-revive 롤백 20261028T161022 — 7행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('f92867b3-e0fd-4ad3-ae1a-34fcaae69c9f'::uuid, 'exhausted', 0),
  ('8087b231-642f-40fb-b9d5-12bd9002085e'::uuid, 'exhausted', 0),
  ('f06b4d91-91d7-40a7-b3b1-5468cdbfd5b2'::uuid, 'exhausted', 0),
  ('50e690c7-1368-4a4d-b8a8-26200c122f20'::uuid, 'exhausted', 0),
  ('1c0508ba-03cd-4f32-8f89-c662e15cb371'::uuid, 'exhausted', 0),
  ('a810c6de-479a-433a-aa97-f00a68dfa27d'::uuid, 'exhausted', 0),
  ('3ee0f078-d052-43db-a51a-df8bca20e4dd'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('f92867b3-e0fd-4ad3-ae1a-34fcaae69c9f', '8087b231-642f-40fb-b9d5-12bd9002085e', 'f06b4d91-91d7-40a7-b3b1-5468cdbfd5b2', '50e690c7-1368-4a4d-b8a8-26200c122f20', '1c0508ba-03cd-4f32-8f89-c662e15cb371', 'a810c6de-479a-433a-aa97-f00a68dfa27d', '3ee0f078-d052-43db-a51a-df8bca20e4dd') AND status = 'active';  -- 기대 0
