-- 20261116000003_area_pay_vocab — v71cp: 결제·정산·회계(areas_v2 priority 2)를 영역 코드 'pay' 로 정식 추가한다(허용값 확장, 새 어휘는 기존의 상위집합).
-- 영역 번호: ⑩ 결제·정산·회계 = 'pay'. 기존 행·값 무변경. CHECK 한 개만 바꾼다.
-- 같은 트랜잭션에서 v71cp 가 'hold:payments_billing_accounting(areas_v2)' 표시로 NULL 처리해 둔 3행(Bigcapital·InvoiceShelf·Akaunting)만 'pay' 로 옮긴다.
-- ⚠️ DDL 이 포함돼 있어 삭제성 SQL 훅(block-destructive-sql.js)이 execute_sql 로는 막는다 — Supabase SQL Editor 에서 적용(남헌/CTO).
-- 롤백: *_rollback.sql — 'pay' 행을 먼저 NULL 로 돌려 hold 표시를 복원한 뒤 CHECK 를 되돌린다.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE public.analysis_projects DROP CONSTRAINT IF EXISTS analysis_projects_area_code_check;
ALTER TABLE public.analysis_projects ADD CONSTRAINT analysis_projects_area_code_check
  CHECK (area_code IS NULL OR area_code IN ('1', '2', '3', '4', '5', 'work', 'design', 'pay', 'hold', 'out-consumer', 'out-founder'));
UPDATE public.analysis_projects
   SET area_code = 'pay', area_basis = 'label', area_evidence = 'pay:payments_billing_accounting(areas_v2)', area_rule_ver = 'v71cp-pay', area_assigned_at = now()
 WHERE area_code IS NULL AND area_evidence = 'hold:payments_billing_accounting(areas_v2)';
COMMIT;
