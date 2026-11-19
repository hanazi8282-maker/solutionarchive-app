-- 롤백(붙여넣기용): 새 함수·새 표만 지운다. 표는 ss_* 에서 다시 계산되는 파생 스냅샷이라 원본 데이터 손실이 없다.
-- 기존 뷰 outcome_pairs·outcome_pairs_norm, 표 outcome_pairs_repeated 는 건드리지 않는다(뷰 주석만 원래대로 비운다).
BEGIN;
DROP FUNCTION IF EXISTS public.refresh_outcome_pairs_matched(int, int);
DROP TABLE IF EXISTS public.outcome_pairs_matched;
COMMENT ON VIEW public.outcome_pairs_norm IS NULL;
COMMIT;
