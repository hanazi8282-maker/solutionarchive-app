-- 롤백: 20260930000027_relevance_auto_approval.sql
-- 2차 판정(파일에서 다시 import 가능)과 자동 승인 표시(다음 실행이 다시 찍음)만 사라진다. verdict·human_verdict·라벨은 그대로다.
DROP INDEX IF EXISTS public.idx_review_relevance_verdicts_auto_approved;
ALTER TABLE public.review_relevance_verdicts
  DROP COLUMN IF EXISTS auto_approval_rule,
  DROP COLUMN IF EXISTS auto_approved_at,
  DROP COLUMN IF EXISTS second_judged_at,
  DROP COLUMN IF EXISTS second_model,
  DROP COLUMN IF EXISTS second_verdict;
