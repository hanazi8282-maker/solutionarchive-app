-- v71cq §3·§4: 무료 초안 신청자의 유료본 결제 요청(계좌이체 수동 확인) + 상황 질문 답. 추가 전용.
--  - consult_lead_payments: 열람 토큰(리드)에 묶인 결제 요청. 입금 확인 전에는 유료 기능이 안 열리고, 남헌이 /consult/admin 에서 활성화해야 열린다.
--  - consult_leads.situation(+situation_at): 유료 상황 질문 답(lib/consult/situation.ts 의 값 목록). 한 번 저장하면 덮어쓰지 않는다.
BEGIN;
CREATE TABLE IF NOT EXISTS public.consult_lead_payments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id        uuid NOT NULL REFERENCES public.consult_leads(id),
  amount_krw     integer NOT NULL CHECK (amount_krw IN (49000, 99000)),
  depositor_name text NOT NULL,
  status         text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','active','ended','rejected')),
  requested_at   timestamptz NOT NULL DEFAULT now(),
  activated_at   timestamptz,
  activated_by   text,
  note           text
);
CREATE INDEX IF NOT EXISTS consult_lead_payments_lead_idx ON public.consult_lead_payments (lead_id, requested_at DESC);
ALTER TABLE public.consult_lead_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.consult_lead_payments FROM anon, authenticated;
ALTER TABLE public.consult_leads ADD COLUMN IF NOT EXISTS situation jsonb;
ALTER TABLE public.consult_leads ADD COLUMN IF NOT EXISTS situation_at timestamptz;
COMMIT;
-- 확인(양성): to_regclass('public.consult_lead_payments') 존재·relrowsecurity=true, consult_leads.situation 존재 / 음성: has_table_privilege('anon','public.consult_lead_payments','SELECT') = false
