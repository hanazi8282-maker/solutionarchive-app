-- target-revive 롤백 20261030T002721 — 7행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('d626f889-f616-4dd5-99a9-42ad339f875f'::uuid, 'exhausted', 3),
  ('53e21ff8-6699-416b-9d6d-8e03de88fe38'::uuid, 'exhausted', 1),
  ('972b5de3-e353-4a52-9012-a365430b56c8'::uuid, 'exhausted', 1),
  ('8768c485-290b-4a97-8807-f889bf9f3969'::uuid, 'exhausted', 0),
  ('d1160c96-dca6-4f0f-82a0-d34cd326da12'::uuid, 'exhausted', 1),
  ('9fa18276-7fae-4f88-a37c-a1e8e86470bc'::uuid, 'exhausted', 1),
  ('a6c6fad6-90d8-473a-bc6b-51e384124b61'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('d626f889-f616-4dd5-99a9-42ad339f875f', '53e21ff8-6699-416b-9d6d-8e03de88fe38', '972b5de3-e353-4a52-9012-a365430b56c8', '8768c485-290b-4a97-8807-f889bf9f3969', 'd1160c96-dca6-4f0f-82a0-d34cd326da12', '9fa18276-7fae-4f88-a37c-a1e8e86470bc', 'a6c6fad6-90d8-473a-bc6b-51e384124b61') AND status = 'active';  -- 기대 0
