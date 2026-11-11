-- 20261111000040_purgeable_nulls_first_idx — v71ci A3: review-purge.mjs 후보 조회가 57014(statement_timeout 8s)로 죽던 것.
-- 원인: 쿼리는 ORDER BY collected_at ASC NULLS FIRST 인데 기존 analysis_inputs_purgeable_idx 는 기본 정렬(NULLS LAST)이라
--   planner 가 인덱스를 못 쓰고 병렬 순차 스캔+top-N 정렬(EXPLAIN 4,737ms, 부하 시 8s 초과)을 했다.
-- 조치: 같은 술어·NULLS FIRST 인 인덱스를 추가(add-only, 기존 인덱스·스크립트 무변경). 적용 후 EXPLAIN 22ms.
-- 롤백: 20261111000040_purgeable_nulls_first_idx_rollback.sql
BEGIN;
CREATE INDEX IF NOT EXISTS analysis_inputs_purgeable_nf_idx
  ON public.analysis_inputs (collected_at NULLS FIRST)
  WHERE source_key IS NOT NULL AND raw_text IS NOT NULL;
COMMIT;
-- 확인(양성): EXPLAIN SELECT id FROM public.analysis_inputs WHERE source_key IS NOT NULL AND raw_text IS NOT NULL ORDER BY collected_at ASC NULLS FIRST LIMIT 1000;  -- Index Scan using analysis_inputs_purgeable_nf_idx
