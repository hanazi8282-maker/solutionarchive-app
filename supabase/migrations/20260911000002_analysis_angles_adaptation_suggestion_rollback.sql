-- 롤백: analysis_angles.adaptation_suggestion 컬럼 제거.
ALTER TABLE public.analysis_angles DROP COLUMN IF EXISTS adaptation_suggestion;
