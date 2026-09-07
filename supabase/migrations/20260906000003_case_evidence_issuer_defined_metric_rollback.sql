-- 20260906000003 롤백.
--
-- 컬럼을 지우면 어떤 근거를 "감사 범위 밖"으로 판정했는지가 함께 사라진다.
-- 되돌릴 거라면 지우기 전에 그 판정을 따로 뽑아 두는 편이 낫다:
--   SELECT id, url, supports_claim FROM public.case_evidence WHERE is_issuer_defined_metric;

BEGIN;

ALTER TABLE public.case_evidence
  DROP CONSTRAINT IF EXISTS case_evidence_issuer_metric_not_estimate;

ALTER TABLE public.case_evidence
  DROP COLUMN IF EXISTS is_issuer_defined_metric;

COMMIT;
