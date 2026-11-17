-- [꼬리표] 읽는 쪽용 뷰: case_id 마다 개정 표(case_bank_label_revisions)의 최신 줄이 있으면 그것, 없으면 원본 줄.
-- 원본·개정 표는 그대로(추가 전용). security_invoker 라 호출자 권한으로 읽는다 → anon/authenticated 는 기존처럼 못 읽는다.
BEGIN;
CREATE OR REPLACE VIEW public.case_bank_labels_current WITH (security_invoker = true) AS
SELECT DISTINCT ON (case_id)
  id, case_id, source, domain, segment, buyer_type, channel_main, pricing_model, price_band_usd_mo, revenue_band,
  stage_at_snapshot, outcome, failure_mode, fit_broken, kill_flags, evidence_quote, confidence, label_model, label_run, created_at
FROM (
  SELECT 1 AS pri, r.* FROM public.case_bank_label_revisions r
  UNION ALL
  SELECT 0 AS pri, b.* FROM public.case_bank_labels b
) u
ORDER BY case_id, pri DESC, created_at DESC;
REVOKE ALL ON public.case_bank_labels_current FROM anon, authenticated;
COMMIT;
-- 확인(양성): select count(*) from case_bank_labels_current = 원본 줄 수(12,224) / 음성: has_table_privilege('anon','public.case_bank_labels_current','SELECT') = false
