-- 20260930000029_case_auto_approval 롤백. ⚠️ DROP COLUMN 은 CLAUDE.md §10.2 사람 판단 예외다.
-- 되돌릴 일이 생기면 먼저 값을 NULL 로 두는 쪽을 쓴다(연결 설계 §5-2). 자동 승인 행이 있으면 로드맵 §4-2 되돌리기를 먼저 돌린다:
--   select count(*) from public.case_moves where auto_approval_rule = 'ca-v1' and review_status = 'approved';  -- 0 이어야 한다

DROP INDEX IF EXISTS public.case_moves_auto_approved_idx;
ALTER TABLE public.case_moves
  DROP COLUMN IF EXISTS auto_candidate_at,
  DROP COLUMN IF EXISTS auto_approved_at,
  DROP COLUMN IF EXISTS auto_approval_rule;
ALTER TABLE public.case_studies
  DROP COLUMN IF EXISTS auto_approved_at,
  DROP COLUMN IF EXISTS auto_approval_rule;
