-- 롤백: 20260908000002_research_queue
--
-- ⚠️ 이 롤백은 20260908000001 보다 **먼저** 실행해야 한다.
--    research_queue.run_id 가 agent_runs 를 참조하기 때문이다.
--    역순 규칙: 002 롤백 → 001 롤백.

BEGIN;

DROP INDEX IF EXISTS public.research_queue_run_idx;
DROP INDEX IF EXISTS public.research_queue_pick_idx;
DROP TABLE IF EXISTS public.research_queue;

COMMIT;

-- 확인
-- SELECT table_name FROM information_schema.tables
--  WHERE table_schema='public' AND table_name='research_queue';   -- 기대: 0행
