-- target-revive 롤백 20261117T031319 — 7행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('d9436cfc-596d-4b4c-bb69-d81eb6a484e1'::uuid, 'exhausted', 0),
  ('8f3004f0-25a4-4f4a-b9a8-ce69fd9b5dee'::uuid, 'exhausted', 0),
  ('b21f82c7-3fa7-49c8-a2e0-65b77ed8df47'::uuid, 'exhausted', 0),
  ('f5b738a4-46ea-43af-af5f-b383b65a1e20'::uuid, 'exhausted', 0),
  ('53e21ff8-6699-416b-9d6d-8e03de88fe38'::uuid, 'exhausted', 0),
  ('972b5de3-e353-4a52-9012-a365430b56c8'::uuid, 'exhausted', 0),
  ('17790f7a-6857-4b32-ace1-2183730b1868'::uuid, 'exhausted', 0)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('d9436cfc-596d-4b4c-bb69-d81eb6a484e1', '8f3004f0-25a4-4f4a-b9a8-ce69fd9b5dee', 'b21f82c7-3fa7-49c8-a2e0-65b77ed8df47', 'f5b738a4-46ea-43af-af5f-b383b65a1e20', '53e21ff8-6699-416b-9d6d-8e03de88fe38', '972b5de3-e353-4a52-9012-a365430b56c8', '17790f7a-6857-4b32-ace1-2183730b1868') AND status = 'active';  -- 기대 0
