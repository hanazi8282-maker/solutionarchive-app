-- ============================================================
-- 롤백: 20260816000002_analysis_maturity.sql
-- analysis_projects 에 추가한 Stage2 컬럼 3종만 제거한다.
-- 다른 컬럼/테이블은 건드리지 않는다.
-- ============================================================

ALTER TABLE public.analysis_projects DROP COLUMN IF EXISTS m_meta_signal;
ALTER TABLE public.analysis_projects DROP COLUMN IF EXISTS maturity_notes;
ALTER TABLE public.analysis_projects DROP COLUMN IF EXISTS maturity_stage;
