-- 20261102000010_hubspot_microsaas_ideas.sql  (제1참모 초안 — CC가 리포 마이그레이션 규칙대로 적용·검토)
-- 출처: HubSpot 공개 시트 "Micro-SaaS Ideas Database [Starter Story]" (2026-11-02 수령, 190행). 등급: 자기신고, Starter Story 계열 = B(남헌 11/02 결정).
create table if not exists public.hubspot_microsaas_ideas (
  id bigserial primary key,
  idea text not null,
  monthly_revenue_raw text,
  monthly_revenue_usd numeric,        -- "$24K" -> 24000, 파싱 실패 NULL
  monthly_traffic_raw text,           -- 137/190 결측 -> 사용 금지(콘텐츠 규칙)
  revenue_per_visitor_raw text,       -- 140/190 결측 -> 사용 금지
  starting_costs_raw text,
  starting_costs_usd numeric,
  solopreneur_score int check (solopreneur_score between 0 and 100),
  icp text,
  growth_tactics text,
  evidence_grade text not null default 'B',
  source text not null default 'hubspot_starterstory_sheet_2026-11-02',
  ss_idea_id text,                    -- Starter Story 아이디어와 조인 시 채움(일부 겹침 가정, 미확인)
  created_at timestamptz not null default now(),
  unique (idea, source)
);
alter table public.hubspot_microsaas_ideas enable row level security;  -- 정책 0개 = service_role 전용
comment on table public.hubspot_microsaas_ideas is 'HubSpot Micro-SaaS 아이디어 190행(자기신고, Starter Story 계열 B등급). Solopreneur Score가 새 값. 트래픽·방문자당 매출은 결측 많아 카드에 쓰지 않는다.';
