-- ============================================================
-- 20260930000039_case_moves_insight_grade_rollback
--
-- 위 마이그레이션을 되돌린다. 🔴 DROP COLUMN 이라 §10.2 예외 1(되돌리기 어려운 삭제)에 걸린다 —
-- 사람 판단 뒤에만 실행한다. 다만 잃는 것은 계산값뿐이다: insight_grade 는 evidence_grade 사본이거나
-- gradeMove 재계산값이라 `case-review.mjs regrade` 로 언제든 다시 만든다(사람 판정 컬럼 아님).
--
-- 되돌리기 **전에** lib/cases/grade-display.ts INSIGHT_GRADE_COLUMN_READY 를 false 로 되돌린
-- 배포가 나가 있어야 한다 — 플래그가 true 인 채로 컬럼을 지우면 무브 조회가 42703 으로 전부 죽는다.
-- 화면은 죽지 않는다: 플래그 false 면 evidence_grade(같은 값)로 읽는다.
-- ============================================================

BEGIN;

ALTER TABLE case_moves DROP CONSTRAINT IF EXISTS case_moves_insight_grade_vocab;
ALTER TABLE case_moves DROP COLUMN IF EXISTS insight_grade;

-- 주석은 적용 전 상태로(pmf_grade 는 000004 원문, 나머지 둘은 20260916000002 원문)
COMMENT ON COLUMN case_moves.pmf_grade IS 'PMF 등급 A~D = S×T (lib/cases/draft.ts pmfGrade). 화면 배지 1순위 축';
COMMENT ON COLUMN case_moves.evidence_grade IS
  '독자 인사이트 등급(2026-09-16 재설계) — transfer_note·preconditions 기반. 사실확인은 fact_check_grade.';
COMMENT ON COLUMN case_moves.fact_check_grade IS
  '사실확인 등급(옛 evidence_grade 산식). CG-1/CG-2 발행 게이트 전용. evidence_grade 는 2026-09-16부터 독자 인사이트 등급.';

COMMIT;

-- 확인(양성: 0)
-- SELECT count(*) FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'case_moves' AND column_name = 'insight_grade';
