-- v71cu S2-1: 빈 타깃 간격 늘리기용 칸(추가 전용, 전부 NULL 허용). 롤백 파일 짝 있음.
ALTER TABLE public.review_targets
  ADD COLUMN IF NOT EXISTS next_visit_at timestamptz,
  ADD COLUMN IF NOT EXISTS dormant_at timestamptz,
  ADD COLUMN IF NOT EXISTS dormant_reason text,
  ADD COLUMN IF NOT EXISTS layer text,
  ADD COLUMN IF NOT EXISTS onboard_batch text;
CREATE INDEX IF NOT EXISTS review_targets_next_visit_idx ON public.review_targets (source_key, next_visit_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS review_targets_onboard_batch_idx ON public.review_targets (onboard_batch) WHERE onboard_batch IS NOT NULL;
