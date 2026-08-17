-- ============================================================
-- 롤백: 20260816000003_analysis_extract_job.sql
-- 1) 잡 추적 컬럼 4종 제거
-- 2) status CHECK 를 processing/failed 없는 원래 목록으로 되돌림
--
-- ⚠️ 주의: processing 또는 failed 상태로 남아있는 행이 있으면 CHECK 복원이
--    실패한다. 먼저 아래로 정리한 뒤 실행할 것.
--      UPDATE public.analysis_projects SET status='collecting'
--       WHERE status IN ('processing','failed');
--
-- 다른 테이블/컬럼은 건드리지 않는다.
-- ============================================================

-- ── 1) 잡 추적 컬럼 제거 ─────────────────────────────────────
ALTER TABLE public.analysis_projects DROP COLUMN IF EXISTS extract_attempts;
ALTER TABLE public.analysis_projects DROP COLUMN IF EXISTS extract_error;
ALTER TABLE public.analysis_projects DROP COLUMN IF EXISTS extract_finished_at;
ALTER TABLE public.analysis_projects DROP COLUMN IF EXISTS extract_started_at;

-- ── 2) status CHECK 원복 ─────────────────────────────────────
ALTER TABLE public.analysis_projects
  DROP CONSTRAINT IF EXISTS analysis_projects_status_check;

ALTER TABLE public.analysis_projects
  ADD CONSTRAINT analysis_projects_status_check
  CHECK (status IN ('collecting', 'extracted', 'scored', 'reviewed', 'angled', 'done'));
