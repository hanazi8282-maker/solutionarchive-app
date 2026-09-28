-- 롤백: 20260930000032_relevance_criteria_feedback.sql
-- 기준 보완 메모만 사라진다. 채점 값(review_relevance_verdicts.human_*)은 그대로다.
DROP TABLE IF EXISTS public.relevance_criteria_feedback;
