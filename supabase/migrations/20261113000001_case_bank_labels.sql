-- v71ck C-1: 사례 은행 통합 라벨(domain/segment/outcome 등). 추가 전용, 기존 테이블 변경 없음.
-- case_id 는 "<source>:<natural_key>" 형식(case_bank_meta와 같은 관례, FK 아님 — 소스가 yc_companies/idea_bank 등 여러 테이블에 걸쳐 case_bank_meta 범위 밖도 포함하기 때문).
create table if not exists case_bank_labels (
  id uuid primary key default gen_random_uuid(),
  case_id text not null unique,
  -- 2026-11-13: 'ss_business'(단수)로 돼 있었는데 scripts/label-case-bank.mjs는 테이블명과 같은 'ss_businesses'를 넘긴다 —
  -- 실측으로 1309건이 라벨 적재 실패(비용만 소모, DB 미반영)한 것을 발견해 고쳤다.
  source text not null check (source in (
    'yc_companies','ss_businesses','failure_ledger','idea_bank','ideaproof_ref','ss_moves','nl_saastr','nl_trends_vc','nl_lenny','nl_saas_playbook'
  )),
  domain text check (domain in (
    'hr_attendance','payments_billing_accounting','booking_scheduling_forms','email_marketing_automation','sales_crm',
    'nocode_automation','analytics','devtools_infra','content_creator_tools','ecommerce_seller_tools','other_saas','not_saas'
  )),
  segment text check (segment in ('P','S','M','E','unknown')),
  buyer_type text check (buyer_type in ('smb_owner','team_lead','enterprise','consumer','dev','unknown')),
  channel_main text check (channel_main in ('organic_seo','social','word_of_mouth','direct_sales','partnership','paid_ads','marketplace','community','unknown')),
  pricing_model text check (pricing_model in ('subscription','usage','one_time','freemium','free','unknown')),
  price_band_usd_mo text check (price_band_usd_mo in ('<10','10-49','50-249','250-999','1000+','unknown')),
  revenue_band text check (revenue_band in ('<1k','1-5k','5-10k','10-50k','50-100k','100-500k','500k+','unknown')),
  stage_at_snapshot text check (stage_at_snapshot in ('prelaunch','first10','mrr_1_10k','mrr_10_100k','scaling','unknown')),
  outcome text check (outcome in ('success','failure','acquired','zombie','unknown')),
  failure_mode text,
  fit_broken text check (fit_broken in ('0','1','2','3','4','none','unknown')),
  kill_flags text[] default '{}',
  evidence_quote text check (evidence_quote is null or length(evidence_quote) <= 130),
  confidence text check (confidence in ('high','mid','low')),
  label_model text not null default 'claude-haiku-5-5',
  label_run text,
  created_at timestamptz not null default now()
);

create index if not exists case_bank_labels_source_idx on case_bank_labels (source);
create index if not exists case_bank_labels_domain_idx on case_bank_labels (domain);
create index if not exists case_bank_labels_outcome_idx on case_bank_labels (outcome);

alter table case_bank_labels enable row level security;
revoke all on case_bank_labels from anon, authenticated;
comment on table case_bank_labels is 'v71ck: 사례 은행 통합 라벨(domain·segment·outcome 등). service_role 전용(anon/authenticated 권한 없음).';
