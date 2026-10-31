-- target-revive 롤백 20261031T111253 — 6행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('7ca77997-f03b-4c35-a7eb-926d59d186d6'::uuid, 'exhausted', 1),
  ('7c68c00c-c7ac-4cf0-bdc8-64715264de19'::uuid, 'exhausted', 0),
  ('a6d89ba2-f017-4e5b-b6d2-e33e1245449c'::uuid, 'exhausted', 1),
  ('253de1c6-299e-41fd-9270-9c2a29ded210'::uuid, 'exhausted', 1),
  ('91c4c190-3789-4bb1-8221-7e6cc7a8e984'::uuid, 'exhausted', 1),
  ('9330b698-eccd-452b-b53e-1e3bd652eedc'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('7ca77997-f03b-4c35-a7eb-926d59d186d6', '7c68c00c-c7ac-4cf0-bdc8-64715264de19', 'a6d89ba2-f017-4e5b-b6d2-e33e1245449c', '253de1c6-299e-41fd-9270-9c2a29ded210', '91c4c190-3789-4bb1-8221-7e6cc7a8e984', '9330b698-eccd-452b-b53e-1e3bd652eedc') AND status = 'active';  -- 기대 0
