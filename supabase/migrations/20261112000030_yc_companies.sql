-- 20261112000030_yc_companies — v71cj 작업 6(C2): YC 회사 공개 목록(yc-oss JSON) 적재용 새 표. add-only.
-- 단일 출처(자기보고 아님·독립 출처 없음) = E-10 등급 C → case_bank 화면에는 A·B 만 노출되므로 뷰는 건드리지 않는다.
-- RLS 켬·정책 0 = service_role 전용, anon/authenticated 회수. 롤백: 20261112000030_yc_companies_rollback.sql
BEGIN;
CREATE TABLE IF NOT EXISTS public.yc_companies (
  yc_id         int PRIMARY KEY,
  name          text NOT NULL,
  slug          text,
  website       text,
  one_liner     text,
  batch         text,
  status        text NOT NULL,
  industry      text,
  subindustry   text,
  tags          text[] NOT NULL DEFAULT '{}',
  team_size     int,
  location      text,
  launched_year int,
  source_url    text,
  grade         text NOT NULL DEFAULT 'C' CHECK (grade IN ('A','B','C','D')),
  snapshot_date date NOT NULL DEFAULT current_date,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_yc_companies_status ON public.yc_companies (status, batch);
ALTER TABLE public.yc_companies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.yc_companies FROM anon, authenticated;
COMMIT;
-- 확인(양성): relrowsecurity=true / 음성: has_table_privilege('anon','public.yc_companies','SELECT')=false
