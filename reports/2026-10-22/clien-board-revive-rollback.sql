-- clien-board-revive-rollback — clien-board-revive.sql 을 되돌린다. 적용 전 SELECT 로 본 이전 값이 exhausted 였던 행만 대상.
-- 수집된 analysis_inputs·cursor·last_run_at 은 되돌리지 않는다(데이터 삭제 없음).
BEGIN;
UPDATE public.review_targets
   SET status = 'exhausted'
 WHERE source_key = 'clien' AND product_ref IN ('board:use', 'board:jirum') AND status = 'active';
COMMIT;
-- consecutive_empty 이전 값은 적용 전 SELECT 결과로 따로 되돌린다(값이 행마다 다르다).
