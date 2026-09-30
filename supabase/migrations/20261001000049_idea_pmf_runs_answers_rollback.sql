-- ============================================================
-- 20261001000049_idea_pmf_runs_answers — 롤백
--
-- ⛔ 미적용, 오케스트레이터가 판단. 서브에이전트·무인 루프는 실행하지 않는다.
-- ⚠️ DROP TABLE 이다. 실행(run)·답변 행이 1건이라도 생긴 뒤에는 되돌리기 어려운 삭제(§10.2 사람 판단 예외 1번)다 — 먼저 센다:
--      SELECT (SELECT count(*) FROM public.idea_pmf_runs) AS runs, (SELECT count(*) FROM public.idea_pmf_answers) AS answers;
--    둘 다 0 이면 잃는 것이 없다. 20261001000050 을 적용했으면 그 롤백을 먼저 돌린다(idea_query_log.pmf_run_id FK).
-- 코드 쪽 되돌리기: P3(idea-pmf-run)·P4(패널) PR revert 가 먼저다.
-- ============================================================

BEGIN;
DROP TABLE IF EXISTS public.idea_pmf_answers CASCADE;
DROP TABLE IF EXISTS public.idea_pmf_runs CASCADE;
COMMIT;
