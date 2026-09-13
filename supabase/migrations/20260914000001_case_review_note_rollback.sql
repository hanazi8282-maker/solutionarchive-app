-- 20260914000001_case_review_note 롤백.
-- ⚠️ 파괴적: 화면(/cases)에서 남긴 반려 사유·무브 검수자 기록이 사라진다. 먼저 백업:
--   SELECT id, review_status, review_note, reviewed_by, reviewed_at FROM public.case_moves WHERE review_note IS NOT NULL OR reviewed_by IS NOT NULL;
--   SELECT id, review_status, review_note FROM public.case_studies WHERE review_note IS NOT NULL;

BEGIN;

ALTER TABLE public.case_moves
  DROP COLUMN IF EXISTS review_note,
  DROP COLUMN IF EXISTS reviewed_by,
  DROP COLUMN IF EXISTS reviewed_at;

ALTER TABLE public.case_studies
  DROP COLUMN IF EXISTS review_note;

COMMIT;
