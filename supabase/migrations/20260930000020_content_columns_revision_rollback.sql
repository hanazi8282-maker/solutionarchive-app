-- 롤백: 20260930000020_content_columns_revision — 수정본 컬럼 5개 제거. 수정본 전문은 drafts/columns/_review/<slug>.revised.md 에도 있어 잃지 않는다.
ALTER TABLE public.content_columns
  DROP COLUMN IF EXISTS body_revised,
  DROP COLUMN IF EXISTS revision_summary,
  DROP COLUMN IF EXISTS revision_status,
  DROP COLUMN IF EXISTS revised_by,
  DROP COLUMN IF EXISTS revised_at;
