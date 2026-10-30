-- target-revive 롤백 20261030T160345 — 7행. scripts/target-revive.mjs --run 이 UPDATE 전에 썼다.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets t
   SET status = v.prev_status, consecutive_empty = v.prev_consecutive_empty
  FROM (VALUES
  ('4b2d9ef1-2d87-4ce7-a602-295b20715c0d'::uuid, 'exhausted', 3),
  ('783536e1-f196-48fc-a49f-37ed9b82eaa1'::uuid, 'exhausted', 1),
  ('e874f1fb-bc99-47f3-bb87-c1e31408c9ef'::uuid, 'exhausted', 1),
  ('4d045944-e264-4f27-9d39-2280806a4a24'::uuid, 'exhausted', 1),
  ('a4fff16b-59a5-4801-98f1-93be4c085d45'::uuid, 'exhausted', 1),
  ('50d27782-19a1-40b4-ac50-9ecbbba53886'::uuid, 'exhausted', 1),
  ('8d1f5dc7-f8c0-4a85-ac35-46ec04014474'::uuid, 'exhausted', 1)
  ) AS v(id, prev_status, prev_consecutive_empty)
 WHERE t.id = v.id AND t.status = 'active';
COMMIT;
-- 확인: SELECT count(*) FROM public.review_targets WHERE id IN ('4b2d9ef1-2d87-4ce7-a602-295b20715c0d', '783536e1-f196-48fc-a49f-37ed9b82eaa1', 'e874f1fb-bc99-47f3-bb87-c1e31408c9ef', '4d045944-e264-4f27-9d39-2280806a4a24', 'a4fff16b-59a5-4801-98f1-93be4c085d45', '50d27782-19a1-40b4-ac50-9ecbbba53886', '8d1f5dc7-f8c0-4a85-ac35-46ec04014474') AND status = 'active';  -- 기대 0
