-- 20260925000001_analysis_projects_owner_email.sql 되돌리기 — 소유자 기록이 사라진다(재사용률 측정 불가).
DROP INDEX IF EXISTS public.analysis_projects_owner_idx;
ALTER TABLE public.analysis_projects DROP COLUMN IF EXISTS owner_email;
