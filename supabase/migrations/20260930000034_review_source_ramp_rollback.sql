-- ============================================================
-- 20260930000034_review_source_ramp — 롤백
--
-- 🔴 파괴적이다. 램프 현재 단계와 변경 이력이 전부 사라진다. 사람만 실행한다(CLAUDE.md §10.2).
-- 지우기 전에 남길 것:
--   SELECT * FROM public.review_source_ramp;
--   SELECT * FROM public.review_source_ramp_log ORDER BY created_at;
-- 러너는 아직 이 테이블을 읽지 않는다 — 엔진이 배선된 뒤라면 엔진부터 끄고 돌린다.
-- ============================================================

BEGIN;

DROP INDEX IF EXISTS public.review_source_ramp_log_source_idx;
DROP TABLE IF EXISTS public.review_source_ramp_log;
DROP TABLE IF EXISTS public.review_source_ramp;

COMMIT;

-- 확인
-- SELECT count(*) FROM information_schema.tables WHERE table_schema='public'
--    AND table_name IN ('review_source_ramp','review_source_ramp_log');   -- 기대: 0
