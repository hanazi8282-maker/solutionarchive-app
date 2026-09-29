-- ============================================================
-- 20260930000040_case_moves_insight_grade_backfill_rollback
--
-- 백필을 되돌린다 — insight_grade 만 NULL 로. 다른 컬럼은 건드리지 않는다.
-- 되돌려도 화면은 같다: displayGrade 가 insight_grade ?? evidence_grade 라 evidence_grade 로 폴백한다.
-- 데이터 손실 없음: insight_grade 는 evidence_grade 사본(또는 regrade 재계산값)이다.
-- ============================================================

BEGIN;

UPDATE case_moves SET insight_grade = NULL WHERE insight_grade IS NOT NULL;

SELECT count(insight_grade) AS 남은_인사이트 FROM case_moves;  -- 기대 0

COMMIT;
