-- v71cq §2-2: 수신 거부 목록. 추가 전용(행을 지우지 않는다). 주소는 소문자로만 저장하고 이유는 선택(최소 수집).
-- 접근: service_role 전용(RLS 켜고 anon·authenticated 권한 제거).
BEGIN;
CREATE TABLE IF NOT EXISTS public.consult_optouts (
  email      text PRIMARY KEY CHECK (email = lower(email) AND length(email) BETWEEN 5 AND 254),
  reason     text CHECK (reason IN ('too_many','no_interest','wrong_person','other')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.consult_optouts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.consult_optouts FROM anon, authenticated;
COMMIT;
-- 확인(양성): to_regclass('public.consult_optouts') 존재·relrowsecurity=true / 음성: has_table_privilege('anon','public.consult_optouts','SELECT') = false
