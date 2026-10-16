-- target-revive 롤백 20261015T231958 — 3행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('d09f1af9-777c-4cf5-95fc-00546830e80b'::uuid, 'exhausted', 3),
  ('b0209037-aeac-4f67-baba-2b1044ae7f41'::uuid, 'exhausted', 3),
  ('338f27e5-bd03-4952-af2c-ac96f7de62dd'::uuid, 'exhausted', 3)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('d09f1af9-777c-4cf5-95fc-00546830e80b', 'b0209037-aeac-4f67-baba-2b1044ae7f41', '338f27e5-bd03-4952-af2c-ac96f7de62dd') AND status = 'active';  -- 기대 0
