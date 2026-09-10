-- 롤백: analysis_projects.mode 컬럼 제거.
ALTER TABLE public.analysis_projects DROP COLUMN IF EXISTS mode;
