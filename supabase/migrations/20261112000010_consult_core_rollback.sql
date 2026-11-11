-- 롤백: 이 마이그가 만든 9표만 지운다(전부 신규). 데이터가 쌓인 뒤에는 먼저 백업.
BEGIN;
DROP TABLE IF EXISTS public.consult_reports, public.consult_payment_requests, public.consult_measure_cards,
  public.consult_messages, public.consult_memos, public.consult_diagnoses, public.consult_collected,
  public.consult_runs, public.llm_usage;
COMMIT;
