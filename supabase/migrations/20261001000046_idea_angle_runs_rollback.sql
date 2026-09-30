-- ============================================================
-- 20261001000046_idea_angle_runs — 롤백
--
-- ⛔ 미적용, 오케스트레이터가 판단. 서브에이전트·무인 루프는 실행하지 않는다.
-- ⚠️ DROP TABLE 이다. **idea_query_log 는 영구 보관 대상(남헌 2026-10-01 확정 2)** — 행이 1건이라도 있으면
--    지우는 것은 §10.2 사람 판단 예외(되돌리기 어려운 삭제)다. 먼저 세고, 0건이 아니면 남헌에게 묻거나 백업부터:
--      SELECT (SELECT count(*) FROM public.idea_query_log) AS log_rows, (SELECT count(*) FROM public.idea_angle_runs) AS run_rows;
--      -- 백업: \copy public.idea_query_log TO 'idea_query_log.csv' CSV HEADER
-- 코드 쪽 되돌리기: 이 PR revert(앵글 패널·API 가 사라진다). 테이블이 없어도 /cases/report 본문은 그대로 뜬다
-- (패널만 "확인 불가"). 로그 테이블만 남기고 싶으면 아래 두 번째 DROP 만 지운다.
-- ============================================================

BEGIN;
DROP TABLE IF EXISTS public.idea_query_log;
DROP TABLE IF EXISTS public.idea_angle_runs;
COMMIT;
