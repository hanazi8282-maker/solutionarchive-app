DROP INDEX IF EXISTS public.review_targets_onboard_batch_idx;
DROP INDEX IF EXISTS public.review_targets_next_visit_idx;
ALTER TABLE public.review_targets DROP COLUMN IF EXISTS onboard_batch, DROP COLUMN IF EXISTS layer, DROP COLUMN IF EXISTS dormant_reason, DROP COLUMN IF EXISTS dormant_at, DROP COLUMN IF EXISTS next_visit_at;
