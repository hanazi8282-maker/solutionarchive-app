-- target-revive 롤백 20261110T223053 — 9행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('ac24f54c-699a-4d59-b11f-f3189548e145'::uuid, 'exhausted', 0),
  ('7b1c6b2e-37d3-4224-9c33-62063b3c7399'::uuid, 'exhausted', 0),
  ('ad2a5c15-4319-43ef-8a45-264a37057599'::uuid, 'exhausted', 2),
  ('06d9a429-1cb9-4a72-b220-e9b98e45b590'::uuid, 'exhausted', 2),
  ('4a3096f4-6c9d-415d-8227-5b9b69afe6d1'::uuid, 'exhausted', 2),
  ('7b91d490-eb8c-4676-9183-454d6f082511'::uuid, 'exhausted', 2),
  ('774bd528-277d-467e-8ffe-b3af96365653'::uuid, 'exhausted', 3),
  ('7e132bd9-5b99-4c70-af44-25cfe8c92865'::uuid, 'exhausted', 1),
  ('02d11d30-2ef9-4339-a51e-34a7c3d8924b'::uuid, 'exhausted', 3)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('ac24f54c-699a-4d59-b11f-f3189548e145', '7b1c6b2e-37d3-4224-9c33-62063b3c7399', 'ad2a5c15-4319-43ef-8a45-264a37057599', '06d9a429-1cb9-4a72-b220-e9b98e45b590', '4a3096f4-6c9d-415d-8227-5b9b69afe6d1', '7b91d490-eb8c-4676-9183-454d6f082511', '774bd528-277d-467e-8ffe-b3af96365653', '7e132bd9-5b99-4c70-af44-25cfe8c92865', '02d11d30-2ef9-4339-a51e-34a7c3d8924b') AND status = 'active';  -- 기대 0
