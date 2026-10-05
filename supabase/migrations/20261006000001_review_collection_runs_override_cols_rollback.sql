-- ============================================================
-- 20261006000001_review_collection_runs_override_cols — 롤백
--
-- 🔴 파괴적이다. 세 컬럼의 값(실행별 예외 사용 건수·예외 값 스냅샷)이 사라지고 재생성 경로가 없다.
--    CLAUDE.md §10.2 예외 1번 "되돌리기 어려운 삭제" — 사람만 실행한다.
-- 지우기 전에 남길 것:
--   SELECT id, source_key, started_at, robots_owner_override, robots_bypassed, override_value
--     FROM public.review_collection_runs
--    WHERE robots_owner_override > 0 OR robots_bypassed > 0 OR override_value IS NOT NULL;
-- 롤백 뒤에도 수집은 돈다 — finishRunRow 가 컬럼 없음(42703/PGRST204)을 받고 세 필드만 빼고 저장한다.
-- ============================================================

BEGIN;

ALTER TABLE public.review_collection_runs
  DROP COLUMN IF EXISTS robots_owner_override,
  DROP COLUMN IF EXISTS robots_bypassed,
  DROP COLUMN IF EXISTS override_value;

COMMIT;

-- 확인
-- SELECT count(*) FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='review_collection_runs'
--    AND column_name IN ('robots_owner_override','robots_bypassed','override_value');   -- 기대: 0
