-- 롤백: 20260930000016_review_verdict_labels_unavailable
-- 컬럼 1개 제거. 값은 사람이 표시한 것뿐이라(34행, 2026-09-25) 잃어도 재표시 가능하다.
ALTER TABLE public.review_relevance_verdicts
  DROP COLUMN IF EXISTS labels_unavailable_reason;
