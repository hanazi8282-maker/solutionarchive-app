-- 롤백: 20260908000001_agent_ops
--
-- 생성 역순으로 지운다. agent_run_steps 가 agent_runs 를 참조하므로 먼저.
-- (ON DELETE CASCADE 는 행 삭제용이지 테이블 삭제 순서를 대신하지 않는다.)
--
-- ⚠️ 실행 이력이 통째로 사라진다. 되돌릴 수 없다. 적용 전에 필요하면
--    `COPY (SELECT ...) TO ...` 로 백업부터 뜬다.

BEGIN;

DROP INDEX IF EXISTS public.agent_run_steps_run_idx;
DROP TABLE IF EXISTS public.agent_run_steps;

DROP INDEX IF EXISTS public.agent_runs_status_idx;
DROP INDEX IF EXISTS public.agent_runs_dept_idx;
DROP TABLE IF EXISTS public.agent_runs;

COMMIT;

-- 확인
-- SELECT table_name FROM information_schema.tables
--  WHERE table_schema='public' AND table_name IN ('agent_runs','agent_run_steps');
--   기대: 0행
