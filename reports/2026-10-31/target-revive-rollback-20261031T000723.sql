-- target-revive 롤백 20261031T000723 — 6행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('ef95c547-485e-4806-9336-f06a9d7645f6'::uuid, 'exhausted', 1),
  ('b9525528-c163-4f06-90f3-7549f05a1c31'::uuid, 'exhausted', 1),
  ('3ec667e0-bc80-4826-a20c-375cb4f82e60'::uuid, 'exhausted', 1),
  ('1ba8e5e0-c689-4dd4-85ea-3ad7bd12f589'::uuid, 'exhausted', 1),
  ('f2a05ccb-3eaa-4956-834f-edc82efcd8ca'::uuid, 'exhausted', 1),
  ('dfb70ea6-41a2-4584-8a22-f8f1119f14c7'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('ef95c547-485e-4806-9336-f06a9d7645f6', 'b9525528-c163-4f06-90f3-7549f05a1c31', '3ec667e0-bc80-4826-a20c-375cb4f82e60', '1ba8e5e0-c689-4dd4-85ea-3ad7bd12f589', 'f2a05ccb-3eaa-4956-834f-edc82efcd8ca', 'dfb70ea6-41a2-4584-8a22-f8f1119f14c7') AND status = 'active';  -- 기대 0
