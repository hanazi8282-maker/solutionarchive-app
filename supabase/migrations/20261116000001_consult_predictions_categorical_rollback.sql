-- 롤백: 20261116000001_consult_predictions_categorical. 추가 칼럼 3개와 CHECK 를 내린다.
-- prob NOT NULL 은 복원하지 않는다 — 범주형 행(prob null)이 있으면 실패하기 때문. 필요하면 그 행을 먼저 정리한 뒤 따로 복원한다.
BEGIN;
ALTER TABLE consult_predictions DROP CONSTRAINT IF EXISTS consult_predictions_prob_null_until_r10;
ALTER TABLE consult_predictions DROP COLUMN IF EXISTS evidence_count;
ALTER TABLE consult_predictions DROP COLUMN IF EXISTS verdict;
ALTER TABLE consult_predictions DROP COLUMN IF EXISTS mode;
COMMIT;
