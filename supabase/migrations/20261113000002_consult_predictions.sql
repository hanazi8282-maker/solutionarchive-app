-- v71cl-엔진 §6: 결론서별 사전 등록 예측(결과 품질 측정용). 추가 전용, 기존 테이블 변경 없음.
-- 결정 품질(루브릭)과 결과 품질(이 테이블)을 분리한다 — 연구 보고서 §6.2.1, 적용계획 §6.
create table if not exists consult_predictions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  claim text not null,
  prob numeric not null check (prob >= 0 and prob <= 1),
  due_at timestamptz not null,
  resolved boolean not null default false,
  outcome boolean,
  brier numeric check (brier is null or (brier >= 0 and brier <= 1)),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists consult_predictions_run_id_idx on consult_predictions (run_id);
create index if not exists consult_predictions_due_at_idx on consult_predictions (due_at) where not resolved;

alter table consult_predictions enable row level security;
revoke all on consult_predictions from anon, authenticated;
comment on table consult_predictions is 'v71cl-엔진: 결론서당 사전 등록 예측 3~5개. 90일 뒤 outcome 기록 → brier 계산. service_role 전용(anon/authenticated 권한 없음).';
