-- 롤백: googleplay cap_base 30 → 15 (20261014000070)
BEGIN;
INSERT INTO public.review_source_ramp_log (source_key, prev_level, new_level, prev_pct, new_pct, event, reason, applied_by)
SELECT r.source_key, r.level, r.level, r.pct_step, r.pct_step, 'day', '상한 30→15(롤백 20261014000070)', 'human-migration 20261014000070-rollback'
  FROM public.review_source_ramp r WHERE r.source_key = 'googleplay' AND r.cap_base = 30;
UPDATE public.review_source_ramp SET cap_base = 15, changed_at = now() WHERE source_key = 'googleplay' AND cap_base = 30;
COMMIT;
