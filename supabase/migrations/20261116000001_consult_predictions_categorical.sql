-- v71cp G8: consult_predictions 를 범주형 기록으로 쓴다. R10(확률 보정 검증) 통과 전에는 숫자 확률을 저장하지 않는다.
-- 비파괴: 칼럼 추가 + prob NOT NULL 해제 + "prob 는 null" CHECK(NOT VALID — 기존 행은 검사하지 않는다). 선행: 20261113000002.
-- R10 통과 뒤 확률을 저장하려면 consult_predictions_prob_null_until_r10 제약만 내린다.
alter table consult_predictions alter column prob drop not null;
alter table consult_predictions add column if not exists mode text check (mode in ('report','memo','b','c1','c2'));
alter table consult_predictions add column if not exists verdict text;
alter table consult_predictions add column if not exists evidence_count integer check (evidence_count is null or evidence_count >= 0);
alter table consult_predictions drop constraint if exists consult_predictions_prob_null_until_r10;
alter table consult_predictions add constraint consult_predictions_prob_null_until_r10 check (prob is null) not valid;
comment on column consult_predictions.verdict is 'v71cp: 범주형 판정(verdict·fit_color·blocked_stage_N·kill 등). 숫자 확률 대신.';

-- 확인(적용 후):
-- 양성: select column_name, is_nullable from information_schema.columns where table_name='consult_predictions' and column_name in ('prob','mode','verdict','evidence_count');  -- prob YES, 3칼럼 존재
-- 음성(롤백되는 형태): begin; insert into consult_predictions(run_id,claim,prob,due_at) values (gen_random_uuid(),'x',0.5,now()); rollback;  -- CHECK 위반으로 실패해야 함
