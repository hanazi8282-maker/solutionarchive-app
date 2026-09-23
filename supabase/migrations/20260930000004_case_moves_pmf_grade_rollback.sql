-- ============================================================
-- 20260930000004_case_moves_pmf_grade_rollback
--
-- 위 마이그레이션을 되돌린다. 🔴 **DROP COLUMN 이라 파괴적이다** — 이 파일은
-- 사람만 실행한다(CLAUDE.md §10.2 예외 1: 되돌리기 어려운 삭제).
--
-- 무엇이 사라지나: 사람이 채점 카드에서 고른 `pmf_signal` · `metric_kind` 가 같이
-- 사라진다. 그건 계산으로 복구할 수 없다(코드는 제안값만 만든다). 그래서 되돌리기
-- 전에 아래 백업을 먼저 뜬다 — 안 뜨면 사람 판정이 영구 소실된다.
--
--   CREATE TABLE case_moves_pmf_backup_20260930 AS
--     SELECT id, pmf_signal, pmf_transfer, pmf_grade, pmf_grade_reason,
--            pmf_provisional, metric_kind
--       FROM case_moves
--      WHERE pmf_signal IS NOT NULL OR pmf_grade IS NOT NULL OR metric_kind IS NOT NULL;
--
-- 되돌려도 화면은 죽지 않는다: `displayGrade()` 가 `pmf_grade ?? evidence_grade` 라
-- 옛 축으로 그대로 돌아간다.
-- ============================================================

BEGIN;

ALTER TABLE case_moves DROP CONSTRAINT IF EXISTS case_moves_pmf_signal_range;
ALTER TABLE case_moves DROP CONSTRAINT IF EXISTS case_moves_pmf_transfer_range;
ALTER TABLE case_moves DROP CONSTRAINT IF EXISTS case_moves_pmf_grade_vocab;
ALTER TABLE case_moves DROP CONSTRAINT IF EXISTS case_moves_metric_kind_vocab;

ALTER TABLE case_moves
  DROP COLUMN IF EXISTS pmf_signal,
  DROP COLUMN IF EXISTS pmf_transfer,
  DROP COLUMN IF EXISTS pmf_grade,
  DROP COLUMN IF EXISTS pmf_grade_reason,
  DROP COLUMN IF EXISTS pmf_provisional,
  DROP COLUMN IF EXISTS metric_kind;

COMMIT;

-- 확인 (양성: 6개 다 없어졌다)
-- SELECT count(*) FROM information_schema.columns
--  WHERE table_name = 'case_moves'
--    AND column_name IN ('pmf_signal','pmf_transfer','pmf_grade','pmf_grade_reason','pmf_provisional','metric_kind');
-- 기대: 0
