-- 롤백: 결제 요청 표와 상황 답 컬럼 제거(데이터가 쌓인 뒤에는 사람 판단 — 결제 기록이 사라진다).
ALTER TABLE public.consult_leads DROP COLUMN IF EXISTS situation_at;
ALTER TABLE public.consult_leads DROP COLUMN IF EXISTS situation;
DROP TABLE IF EXISTS public.consult_lead_payments;
