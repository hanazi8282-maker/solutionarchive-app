-- 20260907000001_case_evidence_observation_keys_rollback.sql
--
-- 20260907000001 의 스키마 롤백 — observation_key / supports_metric 컬럼과
-- 그 제약·인덱스를 제거한다. L-60 · L-64 이전 상태로 되돌린다.
--
-- ⚠️ 순서: 먼저 20260907000002 의 롤백(데이터 NULL 복원)을 돌린 다음 이 파일을 돌린다.
--    컬럼을 지우면 그 안의 값도 같이 사라지므로 데이터 롤백을 먼저 하지 않으면
--    "어떻게 채워져 있었는지" 를 잃는다.
-- ⚠️ 이걸 돌리면 lib/cases/draft.ts 의 gradeMove 가 두 축을 못 읽어 전부 "미기재" 로
--    보고 등급이 잠정 상태가 된다. case-review.mjs regrade 는 컬럼이 없으면 exit 2 로 멈춘다
--    (§7.1 — 축 없이 재계산하면 옛 산식과 같은 답이 나온다). 코드까지 되돌리려면
--    커밋 bdd2dd0(gradeMove 재작성) 이전으로 revert 해야 한다.
-- ⚠️ 적용은 대시보드 SQL Editor 에서 사람이 직접(§12-5).

BEGIN;

-- (2) 수치 뒷받침 여부 --------------------------------------------------
ALTER TABLE public.case_evidence
  DROP CONSTRAINT IF EXISTS case_evidence_supports_metric_needs_move;
ALTER TABLE public.case_evidence
  DROP COLUMN IF EXISTS supports_metric;

-- (1) 원 관측 키 ------------------------------------------------------
DROP INDEX IF EXISTS public.case_evidence_observation_idx;
ALTER TABLE public.case_evidence
  DROP CONSTRAINT IF EXISTS case_evidence_observation_key_shape;
ALTER TABLE public.case_evidence
  DROP COLUMN IF EXISTS observation_key;

COMMIT;

-- 적용 후 확인:
--   node --env-file=.env.local scripts/case-pipeline-verify.mjs --probe
--     기대: "observation_key / supports_metric 없음 — 마이그 20260907000001 미적용" (42703)
