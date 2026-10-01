-- ============================================================
-- 20261001000052_idea_pmf_retention_rls — 롤백: 정책 2개 제거(정책 0 = service_role 전용) + FK 를 CASCADE 로 되돌림
--
-- ⛔ 미적용, 오케스트레이터가 판단. 서브에이전트·무인 루프는 실행하지 않는다.
-- ⚠️ CASCADE 로 되돌리면 run 삭제가 답변까지 지운다 — 남헌 결정(영구 보관, 2026-10-01 v10)과 어긋난다. 정책만 빼려면 2) 만 돌린다.
-- 데이터는 건드리지 않는다.
-- ============================================================

BEGIN;

-- 1) FK 원복(000049 와 같은 ON DELETE CASCADE)
ALTER TABLE public.idea_pmf_answers DROP CONSTRAINT IF EXISTS idea_pmf_answers_run_id_fkey;
ALTER TABLE public.idea_pmf_answers ADD CONSTRAINT idea_pmf_answers_run_id_fkey
  FOREIGN KEY (run_id) REFERENCES public.idea_pmf_runs (id) ON DELETE CASCADE;

-- 2) 정책 제거
DROP POLICY IF EXISTS idea_pmf_answers_select_own ON public.idea_pmf_answers;
DROP POLICY IF EXISTS idea_pmf_runs_select_own ON public.idea_pmf_runs;

COMMIT;

-- 확인: SELECT tablename, count(*) FROM pg_policies WHERE tablename IN ('idea_pmf_runs', 'idea_pmf_answers') GROUP BY 1;  -- 0행
