-- target-revive 롤백 20261113T132550 — 4행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('fafe1a8e-dd42-41d1-b838-b133a18377b3'::uuid, 'exhausted', 2),
  ('1edd90ae-7975-4ee5-86e1-1412505f41a6'::uuid, 'exhausted', 3),
  ('08da2dd9-c072-4752-b64a-683787e28037'::uuid, 'exhausted', 1),
  ('3fbdc913-b78b-414e-a034-cdca7f366d04'::uuid, 'exhausted', 3)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('fafe1a8e-dd42-41d1-b838-b133a18377b3', '1edd90ae-7975-4ee5-86e1-1412505f41a6', '08da2dd9-c072-4752-b64a-683787e28037', '3fbdc913-b78b-414e-a034-cdca7f366d04') AND status = 'active';  -- 기대 0
