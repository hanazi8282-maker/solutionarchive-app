-- ============================================================
-- 20260930000033_review_run_block_counts — 롤백
--
-- 🔴 파괴적이다. 두 컬럼의 값(실행별 차단·쿼터 건수)이 사라지고 재생성 경로가 없다.
--    CLAUDE.md §10.2 "되돌리기 어려운 삭제" — 사람만 실행한다.
-- 지우기 전에 남길 것:
--   SELECT id, source_key, started_at, blocked_responses, quota_responses
--     FROM public.review_collection_runs WHERE blocked_responses > 0 OR quota_responses > 0;
-- 롤백 뒤에도 수집은 돈다 — 러너가 컬럼 없음(42703/PGRST204)을 받고 두 필드만 빼고 저장한다.
-- ============================================================

BEGIN;

ALTER TABLE public.review_collection_runs
  DROP COLUMN IF EXISTS blocked_responses,
  DROP COLUMN IF EXISTS quota_responses;

COMMIT;

-- 확인
-- SELECT count(*) FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='review_collection_runs'
--    AND column_name IN ('blocked_responses','quota_responses');   -- 기대: 0
