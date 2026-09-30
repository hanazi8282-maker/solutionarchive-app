-- ============================================================
-- 20261001000048_idea_query_log_anonymous — 롤백
--
-- ⛔ 미적용, 오케스트레이터가 판단. 서브에이전트·무인 루프는 실행하지 않는다.
-- ⚠️ **익명 행(requested_by NULL)이나 report_view 행이 1건이라도 생긴 뒤에는 이 롤백이 실패한다** —
--    NOT NULL 복원(23502)·outcome CHECK 복원(23514)이 그 행에 걸린다. 삭제 안 함 방침(결정 b)이라 여기서 행을 지우지
--    않는다. 지워서라도 돌리려면 되돌리기 어려운 삭제(§10.2 사람 판단 예외)다 — 남헌에게 묻는다. 먼저 센다:
--      SELECT count(*) FILTER (WHERE requested_by IS NULL) AS anon_rows,
--             count(*) FILTER (WHERE source = 'report_view') AS report_view_rows FROM public.idea_query_log;
-- ⚠️ DROP COLUMN source 도 들어 있다. 위 두 수가 0 이면 기존 행은 전부 'angle_api' 라 잃는 정보가 없다.
-- 코드 쪽 되돌리기: 이 PR revert 가 먼저다(안 하면 report_view insert 가 계속 실패 → console.warn 만 쌓이고 리포트는 뜬다).
-- ============================================================

BEGIN;
DROP INDEX IF EXISTS public.idea_query_log_source_time_idx;
ALTER TABLE public.idea_query_log DROP CONSTRAINT IF EXISTS idea_query_log_outcome_check;
ALTER TABLE public.idea_query_log ADD CONSTRAINT idea_query_log_outcome_check
  CHECK (outcome IN ('new', 'cache_hit', 'limited', 'failed'));
ALTER TABLE public.idea_query_log DROP COLUMN IF EXISTS source;
ALTER TABLE public.idea_query_log ALTER COLUMN requested_by SET NOT NULL;
COMMENT ON TABLE public.idea_query_log IS
  '앵글 API POST 1회 = 1행(append-only, 영구 보관, 남헌 2026-10-01). 캐시 히트·limited·failed 포함. 삭제·TTL 없음. service_role 전용. 20261001000046';
COMMENT ON COLUMN public.idea_query_log.requested_by IS NULL;
COMMIT;
