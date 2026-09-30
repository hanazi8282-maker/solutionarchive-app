-- ============================================================
-- 20261001000050_idea_query_log_source_pmf_api — 롤백
--
-- ⛔ 미적용, 오케스트레이터가 판단. 서브에이전트·무인 루프는 실행하지 않는다.
-- ⚠️ source='pmf_api' 행이 1건이라도 생긴 뒤에는 이 롤백이 실패한다(source CHECK 복원 23514). 삭제 안 함 방침(결정 b)이라
--    여기서 행을 지우지 않는다 — 지워서라도 돌리려면 §10.2 사람 판단 예외다. 먼저 센다:
--      SELECT count(*) FROM public.idea_query_log WHERE source = 'pmf_api';
-- ⚠️ DROP COLUMN pmf_run_id 도 들어 있다. 위 수가 0 이면 그 컬럼은 전부 NULL 이라 잃는 정보가 없다.
-- 코드 쪽 되돌리기: P3 PR revert 가 먼저다.
-- ============================================================

BEGIN;
ALTER TABLE public.idea_query_log DROP CONSTRAINT IF EXISTS idea_query_log_run_matches_source;
ALTER TABLE public.idea_query_log DROP COLUMN IF EXISTS pmf_run_id;
ALTER TABLE public.idea_query_log DROP CONSTRAINT IF EXISTS idea_query_log_source_check;
ALTER TABLE public.idea_query_log ADD CONSTRAINT idea_query_log_source_check
  CHECK (source IN ('angle_api', 'report_view'));
COMMENT ON COLUMN public.idea_query_log.source IS 'angle_api | report_view. 분석 때 같은 사람이 리포트 보고 앵글까지 돌리면 두 행이다 — source 로 갈라 센다.';
COMMIT;
