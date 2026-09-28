-- 롤백: 20260930000030_case_soft_delete.sql
-- ⚠️ 숨김 중인 케이스가 있으면 롤백 즉시 다시 공개된다(숨김 표시·사유가 사라진다). 먼저 확인:
--   SELECT slug, deleted_at, deleted_by, delete_reason FROM public.case_studies WHERE deleted_at IS NOT NULL;
DROP INDEX IF EXISTS public.idx_case_studies_deleted_at;
ALTER TABLE public.case_studies
  DROP COLUMN IF EXISTS delete_reason,
  DROP COLUMN IF EXISTS deleted_by,
  DROP COLUMN IF EXISTS deleted_at;
