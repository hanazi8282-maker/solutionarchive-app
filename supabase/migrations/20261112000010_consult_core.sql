-- 20261112000010_consult_core — v71ci R0: 컨설팅 AI MVP 스키마(consult_*) + llm_usage. 전부 새 표(add-only).
-- RLS 켬·정책 0 = service_role 전용(앱 서버가 세션 이메일로 owner 를 걸러 쓴다 — idea_pmf 와 같은 관례). anon/authenticated 권한 회수.
-- 롤백: 20261112000010_consult_core_rollback.sql
BEGIN;

CREATE TABLE IF NOT EXISTS public.llm_usage (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at    timestamptz NOT NULL DEFAULT now(),
  run_id        uuid,
  owner_email   text,
  purpose       text NOT NULL,            -- collect | diagnosis | l1 | memo | chat | measure | report | judge
  model         text NOT NULL,
  tag           text NOT NULL CHECK (tag IN ('opus','sonnet','haiku','mock')),
  input_tokens  integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cost_usd      numeric(10,5) NOT NULL DEFAULT 0,
  meta          jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_llm_usage_run ON public.llm_usage (run_id, created_at);

CREATE TABLE IF NOT EXISTS public.consult_runs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_email   text NOT NULL,
  kind          text NOT NULL DEFAULT 'company' CHECK (kind IN ('company','idea')),   -- idea = 창업 전 v0
  company_name  text,
  company_url   text,
  one_liner     text,
  scenario      text,                      -- 승인 테스트 시나리오 ①②③ 표식(선택)
  status        text NOT NULL DEFAULT 'new' CHECK (status IN ('new','collecting','diagnosing','done','failed')),
  tier          text NOT NULL DEFAULT 'free' CHECK (tier IN ('free','l1','paid')),
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_consult_runs_owner ON public.consult_runs (owner_email, created_at DESC);

CREATE TABLE IF NOT EXISTS public.consult_collected (   -- E0 collect_company 산출
  run_id     uuid PRIMARY KEY REFERENCES public.consult_runs(id) ON DELETE CASCADE,
  facts      jsonb NOT NULL DEFAULT '{}'::jsonb,        -- {pages:[{url,title,text}], thin:bool, notes:[]}
  thin       boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.consult_diagnoses (   -- layer 0 = 무료 4블록, layer 1 = ⓐ~ⓓ
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id     uuid NOT NULL REFERENCES public.consult_runs(id) ON DELETE CASCADE,
  layer      smallint NOT NULL CHECK (layer IN (0,1)),
  blocks     jsonb NOT NULL,
  model      text NOT NULL,
  cost_usd   numeric(10,5) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, layer)
);

CREATE TABLE IF NOT EXISTS public.consult_memos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id         uuid NOT NULL REFERENCES public.consult_runs(id) ON DELETE CASCADE,
  version        integer NOT NULL DEFAULT 1,
  body           jsonb NOT NULL,
  first_sentence text,
  model          text NOT NULL,
  cost_usd       numeric(10,5) NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, version)
);

CREATE TABLE IF NOT EXISTS public.consult_messages (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id     uuid NOT NULL REFERENCES public.consult_runs(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('user','assistant','tool')),
  content    text NOT NULL,
  tool       jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_consult_messages_run ON public.consult_messages (run_id, id);

CREATE TABLE IF NOT EXISTS public.consult_measure_cards (   -- 보증 1장, 두 모드
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      uuid NOT NULL REFERENCES public.consult_runs(id) ON DELETE CASCADE,
  mode        text NOT NULL CHECK (mode IN ('roi','unknown_fact')),
  title       text NOT NULL,
  metric_name text,
  baseline    numeric,
  target      numeric,
  due_date    date,
  body        jsonb NOT NULL DEFAULT '{}'::jsonb,
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open','met','missed','closed')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id)
);

CREATE TABLE IF NOT EXISTS public.consult_payment_requests (   -- PG 없음: 계좌이체 안내 + 수동 활성화(남헌 확정)
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_email    text NOT NULL,
  run_id         uuid REFERENCES public.consult_runs(id) ON DELETE SET NULL,
  plan           text NOT NULL DEFAULT 'monthly_29000',
  amount_krw     integer NOT NULL DEFAULT 29000,
  depositor_name text,
  status         text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','active','ended','rejected')),
  requested_at   timestamptz NOT NULL DEFAULT now(),
  activated_at   timestamptz,
  activated_by   text,
  ends_at        timestamptz,
  note           text
);
CREATE INDEX IF NOT EXISTS idx_consult_pay_owner ON public.consult_payment_requests (owner_email, requested_at DESC);

CREATE TABLE IF NOT EXISTS public.consult_reports (   -- R11 결론서 단일 생성기 산출 + /r/{token}
  token      text PRIMARY KEY DEFAULT replace(gen_random_uuid()::text, '-', ''),
  run_id     uuid REFERENCES public.consult_runs(id) ON DELETE SET NULL,
  chapters   text[] NOT NULL,                          -- 포함된 장 번호 ['1'] | ['1','2'] | 전 장
  payload    jsonb NOT NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['llm_usage','consult_runs','consult_collected','consult_diagnoses','consult_memos','consult_messages','consult_measure_cards','consult_payment_requests','consult_reports'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
  END LOOP;
END $$;
COMMIT;

-- 확인(양성): 9표 존재·relrowsecurity=true / 음성: has_table_privilege('anon','public.consult_runs','SELECT') = false
