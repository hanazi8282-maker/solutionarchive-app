-- target-revive 롤백 20261110T025733 — 11행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('11ec12ba-b4b3-44af-b046-cae12a6802a0'::uuid, 'exhausted', 3),
  ('793fb4ee-707b-4040-9be0-663b0034aaf6'::uuid, 'exhausted', 3),
  ('34b6c17a-914e-4f99-9521-df309d5a8559'::uuid, 'exhausted', 3),
  ('914bcf4d-649c-4041-86bf-0cb3b73e9f1c'::uuid, 'exhausted', 3),
  ('d3d6c4a3-3486-4126-82ca-c740e75e79f1'::uuid, 'exhausted', 3),
  ('76de6efe-7800-4f49-a063-8ad8c015d2b7'::uuid, 'exhausted', 0),
  ('4e7aac99-9a4a-4ef7-be71-5b2320811a8a'::uuid, 'exhausted', 0),
  ('8ce9bf0c-3f82-4e11-98e1-554065eba325'::uuid, 'exhausted', 0),
  ('eaaf2d54-877b-4e5b-80bf-03b5becf0c72'::uuid, 'exhausted', 0),
  ('6d1f7bf2-d055-4808-ab2a-53dcfb1b542e'::uuid, 'exhausted', 0),
  ('de350aba-8ae9-4c91-a7b2-3b22be7c653e'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('11ec12ba-b4b3-44af-b046-cae12a6802a0', '793fb4ee-707b-4040-9be0-663b0034aaf6', '34b6c17a-914e-4f99-9521-df309d5a8559', '914bcf4d-649c-4041-86bf-0cb3b73e9f1c', 'd3d6c4a3-3486-4126-82ca-c740e75e79f1', '76de6efe-7800-4f49-a063-8ad8c015d2b7', '4e7aac99-9a4a-4ef7-be71-5b2320811a8a', '8ce9bf0c-3f82-4e11-98e1-554065eba325', 'eaaf2d54-877b-4e5b-80bf-03b5becf0c72', '6d1f7bf2-d055-4808-ab2a-53dcfb1b542e', 'de350aba-8ae9-4c91-a7b2-3b22be7c653e') AND status = 'active';  -- 기대 0
