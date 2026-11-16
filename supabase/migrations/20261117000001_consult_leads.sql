-- v71co 개정 §2-2~4: 로그인 없는 무료 초안 신청(리드) + 비공개 열람 + 완성본 입력. 추가 전용(기존 표 변경 없음).
-- 접근: service_role 전용(RLS 켜고 anon·authenticated 권한 제거). 열람 주소의 token 은 gen_random_uuid 기반 32자리 hex.
BEGIN;
CREATE TABLE IF NOT EXISTS public.consult_leads (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token          text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  email          text NOT NULL,
  url            text NOT NULL,
  consent_at     timestamptz NOT NULL,
  copy_variant   text,
  ip_hash        text,
  run_id         uuid REFERENCES public.consult_runs(id),
  report_token   text,
  status         text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','generating','ready','failed')),
  error          text,
  gen_started_at timestamptz,
  mail_draft     text,
  views          int NOT NULL DEFAULT 0,
  max_depth      int NOT NULL DEFAULT 0 CHECK (max_depth BETWEEN 0 AND 100),
  first_viewed_at timestamptz,
  last_viewed_at  timestamptz,
  completion     jsonb,
  completion_at  timestamptz,
  completion_status text CHECK (completion_status IN ('generating','ready','failed')),
  completion_result jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS consult_leads_created_idx ON public.consult_leads (created_at DESC);
ALTER TABLE public.consult_leads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.consult_leads FROM anon, authenticated;
COMMIT;
-- 확인(양성): to_regclass('public.consult_leads') 존재·relrowsecurity=true / 음성: has_table_privilege('anon','public.consult_leads','SELECT') = false
