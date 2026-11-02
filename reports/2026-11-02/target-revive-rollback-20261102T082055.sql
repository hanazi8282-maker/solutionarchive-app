-- target-revive 롤백 20261102T082055 — 13행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('44be035e-cead-4b5b-920b-6594743ba0b9'::uuid, 'exhausted', 3),
  ('c87397f5-3823-4a50-8e21-f661546cca8b'::uuid, 'exhausted', 0),
  ('60eb4db9-62b3-4e7a-947c-b03b40e0bc4b'::uuid, 'exhausted', 0),
  ('542f302b-c271-470e-8a77-78ac90641b0d'::uuid, 'exhausted', 0),
  ('43bcdbc6-c231-48b8-84d9-d8c2e0d72fe5'::uuid, 'exhausted', 0),
  ('13f04527-59c9-45ca-92e0-248c06dd01b0'::uuid, 'exhausted', 0),
  ('3ac60ed3-1cb6-4d31-bf27-476b8789de85'::uuid, 'exhausted', 0),
  ('902f5a29-47e5-4c26-9227-c777c4215e72'::uuid, 'exhausted', 2),
  ('56c22876-44d9-4321-86de-736f349cb936'::uuid, 'exhausted', 1),
  ('996ba187-c184-4811-8241-dc432ba5eaef'::uuid, 'exhausted', 0),
  ('ab2d5365-078a-4472-a1cd-99cb41b62c81'::uuid, 'exhausted', 1),
  ('45e08231-1818-4134-830b-c941afda7403'::uuid, 'exhausted', 1),
  ('0a07a2ac-fdd3-4f9e-a93a-ec9a03fbd3e5'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('44be035e-cead-4b5b-920b-6594743ba0b9', 'c87397f5-3823-4a50-8e21-f661546cca8b', '60eb4db9-62b3-4e7a-947c-b03b40e0bc4b', '542f302b-c271-470e-8a77-78ac90641b0d', '43bcdbc6-c231-48b8-84d9-d8c2e0d72fe5', '13f04527-59c9-45ca-92e0-248c06dd01b0', '3ac60ed3-1cb6-4d31-bf27-476b8789de85', '902f5a29-47e5-4c26-9227-c777c4215e72', '56c22876-44d9-4321-86de-736f349cb936', '996ba187-c184-4811-8241-dc432ba5eaef', 'ab2d5365-078a-4472-a1cd-99cb41b62c81', '45e08231-1818-4134-830b-c941afda7403', '0a07a2ac-fdd3-4f9e-a93a-ec9a03fbd3e5') AND status = 'active';  -- 기대 0
