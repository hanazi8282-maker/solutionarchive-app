-- target-revive 롤백 20261109T000516 — 9행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('64cab8c9-5b0d-4d01-a3c8-2989bf3b72d2'::uuid, 'exhausted', 30),
  ('8d4477af-21bc-43a0-bd3c-c4ea6755e4c2'::uuid, 'exhausted', 0),
  ('340b9f95-5138-4b41-9456-b3549ac3407a'::uuid, 'exhausted', 0),
  ('503469da-6893-444b-b4cb-2948a39e0c4c'::uuid, 'exhausted', 0),
  ('05295a42-eafa-4d77-815c-23b66a254e7f'::uuid, 'exhausted', 0),
  ('c64e5667-7a17-4fac-82fc-ea46092c210d'::uuid, 'exhausted', 0),
  ('dc09983d-e350-44d5-9c83-fa90c990c708'::uuid, 'exhausted', 0),
  ('0adaf23f-e258-4511-bcd3-18239e33384f'::uuid, 'exhausted', 4),
  ('e685b67f-252e-4654-a677-8be9cf943fbe'::uuid, 'exhausted', 3)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('64cab8c9-5b0d-4d01-a3c8-2989bf3b72d2', '8d4477af-21bc-43a0-bd3c-c4ea6755e4c2', '340b9f95-5138-4b41-9456-b3549ac3407a', '503469da-6893-444b-b4cb-2948a39e0c4c', '05295a42-eafa-4d77-815c-23b66a254e7f', 'c64e5667-7a17-4fac-82fc-ea46092c210d', 'dc09983d-e350-44d5-9c83-fa90c990c708', '0adaf23f-e258-4511-bcd3-18239e33384f', 'e685b67f-252e-4654-a677-8be9cf943fbe') AND status = 'active';  -- 기대 0
