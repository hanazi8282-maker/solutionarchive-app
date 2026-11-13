-- v71cm §4 모드 C2 임시 후보 풀: yc_companies subindustry 별 Inactive 비율(분야 기저율 proxy).
-- 영구 집계 테이블이 아니라 함수로 둔다(임시 구현, v71ck case_bank_labels 적재 후 교체 예정).
create or replace function c2_subindustry_base_rates()
returns table (subindustry text, n bigint, inactive_pct numeric)
language sql stable
as $$
  select subindustry, count(*) as n,
    round(100.0 * sum(case when status = 'Inactive' then 1 else 0 end) / count(*), 1) as inactive_pct
  from yc_companies
  where subindustry is not null
  group by subindustry;
$$;

revoke all on function c2_subindustry_base_rates() from anon, authenticated;
comment on function c2_subindustry_base_rates is 'v71cm 모드 C2 임시 후보 풀: subindustry 별 YC Inactive 비율(분야 기저율 proxy). service_role 전용(anon/authenticated EXECUTE 권한 없음).';
