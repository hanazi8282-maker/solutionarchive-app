-- target-revive 롤백 20261021T143342 — 8행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('2494b427-bb16-44f7-99d5-81f71b6a9d52'::uuid, 'exhausted', 0),
  ('902f5a29-47e5-4c26-9227-c777c4215e72'::uuid, 'exhausted', 1),
  ('56c22876-44d9-4321-86de-736f349cb936'::uuid, 'exhausted', 0),
  ('996ba187-c184-4811-8241-dc432ba5eaef'::uuid, 'exhausted', 0),
  ('ab2d5365-078a-4472-a1cd-99cb41b62c81'::uuid, 'exhausted', 0),
  ('45e08231-1818-4134-830b-c941afda7403'::uuid, 'exhausted', 0),
  ('f2dd9ae0-7e8e-45f6-905a-56989912d711'::uuid, 'exhausted', 3),
  ('84e90ba6-0718-44e4-afd3-198b25b92fc0'::uuid, 'exhausted', 3)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('2494b427-bb16-44f7-99d5-81f71b6a9d52', '902f5a29-47e5-4c26-9227-c777c4215e72', '56c22876-44d9-4321-86de-736f349cb936', '996ba187-c184-4811-8241-dc432ba5eaef', 'ab2d5365-078a-4472-a1cd-99cb41b62c81', '45e08231-1818-4134-830b-c941afda7403', 'f2dd9ae0-7e8e-45f6-905a-56989912d711', '84e90ba6-0718-44e4-afd3-198b25b92fc0') AND status = 'active';  -- 기대 0
