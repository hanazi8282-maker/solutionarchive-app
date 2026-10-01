-- ============================================================
-- 20261001000053_idea_query_log_pmf_run_id_no_action — 롤백: FK 를 000050 정의(ON DELETE SET NULL)로 되돌린다
--
-- ⛔ 미적용, 오케스트레이터가 판단. 서브에이전트·무인 루프는 실행하지 않는다.
-- 컬럼은 지우지 않는다 — 컬럼의 주인은 000050 이다(DROP COLUMN 은 그 롤백이 한다). 데이터 불변.
-- ⚠️ SET NULL 로 되돌리면 run 삭제가 로그 연결을 조용히 지운다 — 남헌 결정(영구 보관, 2026-10-01 v10)과 어긋난다.
-- ============================================================

BEGIN;
ALTER TABLE public.idea_query_log DROP CONSTRAINT IF EXISTS idea_query_log_pmf_run_id_fkey;
ALTER TABLE public.idea_query_log ADD CONSTRAINT idea_query_log_pmf_run_id_fkey
  FOREIGN KEY (pmf_run_id) REFERENCES public.idea_pmf_runs (id) ON DELETE SET NULL;
COMMIT;

-- 확인: SELECT conname, confdeltype FROM pg_constraint WHERE conrelid = 'public.idea_query_log'::regclass AND contype = 'f';  -- pmf_run_id 쪽 'n'
