-- target-revive 롤백 20261027T000556 — 11행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('66e30905-11b0-4d76-a2d1-b6164704b9e3'::uuid, 'exhausted', 3),
  ('a024a361-7977-415d-a3d4-cf24ff18517f'::uuid, 'exhausted', 3),
  ('edfd2394-e667-42fd-8138-7c8dd5061a6e'::uuid, 'exhausted', 3),
  ('d69be07e-7ba8-40da-911a-290474f90264'::uuid, 'exhausted', 3),
  ('1029df40-2865-453a-aed7-7ad64cc40714'::uuid, 'exhausted', 3),
  ('39c52c3f-19ab-4a76-b215-2eb97712ad0b'::uuid, 'exhausted', 1),
  ('ce1e0c79-9e94-4ed8-a9be-537d6960e157'::uuid, 'exhausted', 1),
  ('1b8ad848-8268-4d03-b933-30610dada204'::uuid, 'exhausted', 1),
  ('5b05b779-d08b-4542-ad35-fd08dbc9037a'::uuid, 'exhausted', 1),
  ('b94c5193-d9a4-4023-aa6e-02af3a6af8eb'::uuid, 'exhausted', 0),
  ('fa745a26-cb46-4d40-9abe-d9842ddc5527'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('66e30905-11b0-4d76-a2d1-b6164704b9e3', 'a024a361-7977-415d-a3d4-cf24ff18517f', 'edfd2394-e667-42fd-8138-7c8dd5061a6e', 'd69be07e-7ba8-40da-911a-290474f90264', '1029df40-2865-453a-aed7-7ad64cc40714', '39c52c3f-19ab-4a76-b215-2eb97712ad0b', 'ce1e0c79-9e94-4ed8-a9be-537d6960e157', '1b8ad848-8268-4d03-b933-30610dada204', '5b05b779-d08b-4542-ad35-fd08dbc9037a', 'b94c5193-d9a4-4023-aa6e-02af3a6af8eb', 'fa745a26-cb46-4d40-9abe-d9842ddc5527') AND status = 'active';  -- 기대 0
