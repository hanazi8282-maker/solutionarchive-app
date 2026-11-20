-- v71cu S14: 회사 추천표(company_candidates)와 '근거 얇음' 칸. 추가 전용(기존 객체 변경 없음).
-- 표가 이미 있어도 칸만 더하도록 CREATE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS 를 함께 쓴다.
-- 이 파일은 적용하지 않았다(오케스트레이터가 적용). 롤백: *_rollback.sql
BEGIN;
CREATE TABLE IF NOT EXISTS public.company_candidates (
  project_id    uuid PRIMARY KEY,
  area_slug     text,
  company_name  text NOT NULL,
  total         int NOT NULL DEFAULT 0,
  ko            int NOT NULL DEFAULT 0,
  low_total     int NOT NULL DEFAULT 0,
  ko_low        int NOT NULL DEFAULT 0,
  contact_email text,
  criteria      text NOT NULL DEFAULT 'new_v2',
  computed_at   timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.company_candidates ADD COLUMN IF NOT EXISTS thin_evidence boolean NOT NULL DEFAULT false;
ALTER TABLE public.company_candidates ADD COLUMN IF NOT EXISTS thin_reasons text[] NOT NULL DEFAULT '{}';
COMMENT ON COLUMN public.company_candidates.thin_evidence IS '근거 얇음 — true 면 결론서 세션이 건너뛴다(COMPANY_THIN_SKIP_ENABLED=true 일 때). 규칙: lib/consult/company-table.ts';
ALTER TABLE public.company_candidates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.company_candidates FROM anon, authenticated;
COMMIT;
