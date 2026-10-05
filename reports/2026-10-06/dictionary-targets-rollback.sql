-- scripts/dictionary-targets.mjs 투입분 되돌리기 — ⛔ 제안 파일. 실행하지 않았다.
--
-- 투입분 식별: review_targets.label = '<area>:<slug>' (예: '07-ecommerce-ops:cafe24'),
--   source_key IN ('appstore','googleplay'), created_at >= :run_started (스크립트를 돌린 시각, 보고에 남긴다).
-- 프로젝트 식별: 위 타깃의 project_id 중 다른 타깃이 하나도 안 남는 것.

-- [1] 비파괴(권장) — 수집만 멈춘다. 이미 모은 analysis_inputs·판정은 그대로 둔다.
UPDATE public.review_targets
   SET status = 'exhausted'
 WHERE source_key IN ('appstore', 'googleplay')
   AND label ~ '^0[1-7]-[a-z-]+:[a-z0-9-]+$'
   AND created_at >= :'run_started'::timestamptz
   AND status = 'active';

-- [2] 삭제 — §10.2 예외 1번(되돌리기 어려운 삭제). 사람 판단 뒤에만.
--   아직 한 번도 안 돈 타깃(last_run_at IS NULL ∧ total_collected = 0)만 지운다.
--   ⚠️ analysis_projects 를 지우면 analysis_inputs 가 ON DELETE CASCADE 로 같이 사라진다 — 그래서
--      수집이 0건인 프로젝트만 지운다.
-- BEGIN;
-- WITH t AS (
--   DELETE FROM public.review_targets
--    WHERE source_key IN ('appstore', 'googleplay')
--      AND label ~ '^0[1-7]-[a-z-]+:[a-z0-9-]+$'
--      AND created_at >= :'run_started'::timestamptz
--      AND last_run_at IS NULL AND total_collected = 0
--   RETURNING project_id
-- )
-- DELETE FROM public.analysis_projects p
--  USING (SELECT DISTINCT project_id FROM t) d
--  WHERE p.id = d.project_id
--    AND p.created_at >= :'run_started'::timestamptz
--    AND NOT EXISTS (SELECT 1 FROM public.review_targets r WHERE r.project_id = p.id)
--    AND NOT EXISTS (SELECT 1 FROM public.analysis_inputs i WHERE i.project_id = p.id);
-- COMMIT;

-- 확인: SELECT source_key, status, count(*) FROM public.review_targets
--        WHERE label ~ '^0[1-7]-[a-z-]+:' GROUP BY 1, 2;
