-- target-revive 롤백 20261108T000010 — 11행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('d09f1af9-777c-4cf5-95fc-00546830e80b'::uuid, 'exhausted', 4),
  ('b0209037-aeac-4f67-baba-2b1044ae7f41'::uuid, 'exhausted', 4),
  ('338f27e5-bd03-4952-af2c-ac96f7de62dd'::uuid, 'exhausted', 4),
  ('4f8c12ba-5a44-4c10-bb4f-3816fd695a49'::uuid, 'exhausted', 4),
  ('bb291c61-677d-4ce7-9b28-08f0c2090bea'::uuid, 'exhausted', 1),
  ('7e1be496-f204-4e1f-aa80-4d2f504ccb96'::uuid, 'exhausted', 1),
  ('b346a7d9-05cd-4ddf-990a-6a12e86c8f00'::uuid, 'exhausted', 1),
  ('37209189-b119-4073-83f2-d43f6d673b0e'::uuid, 'exhausted', 1),
  ('2b998a95-7b8c-4630-9068-6aed3f0edaf6'::uuid, 'exhausted', 0),
  ('db7437ad-8069-4a06-9778-d0a895f2d61c'::uuid, 'exhausted', 0),
  ('baf9bafc-0de5-498f-b257-fd0b619087c6'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('d09f1af9-777c-4cf5-95fc-00546830e80b', 'b0209037-aeac-4f67-baba-2b1044ae7f41', '338f27e5-bd03-4952-af2c-ac96f7de62dd', '4f8c12ba-5a44-4c10-bb4f-3816fd695a49', 'bb291c61-677d-4ce7-9b28-08f0c2090bea', '7e1be496-f204-4e1f-aa80-4d2f504ccb96', 'b346a7d9-05cd-4ddf-990a-6a12e86c8f00', '37209189-b119-4073-83f2-d43f6d673b0e', '2b998a95-7b8c-4630-9068-6aed3f0edaf6', 'db7437ad-8069-4a06-9778-d0a895f2d61c', 'baf9bafc-0de5-498f-b257-fd0b619087c6') AND status = 'active';  -- 기대 0
