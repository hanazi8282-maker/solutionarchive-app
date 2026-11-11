-- 20261111131210_research_store_v4_20261111 — 결론서 세션(11/11)이 Supabase MCP 로 직접 적용한 마이그레이션을 리포에 맞춘 사본(v71ci 인수인계 7(b)).
-- ⚠️ 이미 적용됨 — 재실행 금지. 내용은 supabase_migrations.schema_migrations.statements(version=20261111131210)에서 그대로 복사했다.
-- research_store = 결론서 세션이 모은 조사 원문·요금·변화·종료 사례·통계·진단의 적재처(서비스키 전용, RLS 정책 없음). 인용 가능 조건 = verified='ok' AND sponsored=false.
create table if not exists public.research_store (
  id bigint generated always as identity primary key,
  run text not null,
  kind text not null,            -- voice | pricing | recent | closed | market | diagnosis
  subject text not null,         -- 서비스 slug (예: creazy, gazet)
  area_code text,
  category text,                 -- voice: A 우회책 / B 이동·이탈 / C 구매자·사용자 / D 가격·결제
  body jsonb not null,
  source_url text,
  verified text,                 -- ok = Python 원문 대조 통과
  sponsored boolean default false,
  collected_by text,
  created_at timestamptz not null default now()
);
create index if not exists research_store_subject_idx on public.research_store(subject, kind);
alter table public.research_store enable row level security;
comment on table public.research_store is '결론서 세션이 API 웹조사로 모은 원문·요금·변화·종료 사례·통계·진단(추가 전용). 인용은 verified=ok, sponsored=false만.';
