-- target-revive 롤백 20261020T063925 — 5행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('d1622847-8988-4d21-b389-7969a484e4ac'::uuid, 'exhausted', 1),
  ('3e27b97a-51a4-46b1-a216-1f77b1354f63'::uuid, 'exhausted', 1),
  ('9b8ef541-4343-400a-9082-5c8a4b91b1c5'::uuid, 'exhausted', 1),
  ('8e9d98da-eca5-4725-9946-270a5aae347d'::uuid, 'exhausted', 1),
  ('82eb0b45-ad7b-4ad2-ac5f-a16e123e1903'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('d1622847-8988-4d21-b389-7969a484e4ac', '3e27b97a-51a4-46b1-a216-1f77b1354f63', '9b8ef541-4343-400a-9082-5c8a4b91b1c5', '8e9d98da-eca5-4725-9946-270a5aae347d', '82eb0b45-ad7b-4ad2-ac5f-a16e123e1903') AND status = 'active';  -- 기대 0
