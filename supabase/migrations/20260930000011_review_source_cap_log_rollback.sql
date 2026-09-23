-- ============================================================
-- 20260930000011_review_source_cap_log — 롤백
--
-- 🔴 파괴적이다. 실행하면 `review_source_cap_log` 의 **행 전부**가 사라진다
--    = 상한을 언제 왜 올렸는지의 유일한 기록이다. 재생성 경로가 없다
--    (`review_sources.daily_request_cap` 은 현재값만 들고 있고 이력이 없다).
--
-- 그래서 CLAUDE.md §10.2 의 "되돌리기 어려운 삭제"(DROP TABLE) 예외에 해당한다 —
-- **사람만 실행한다.** 세션이 자체 판단으로 돌리지 않는다.
--
-- 지우기 전에 남길 것 (없으면 이 파일을 돌리지 마라):
--   SELECT * FROM public.review_source_cap_log ORDER BY created_at;
--
-- 되돌리는 순서: **먼저 pre-step 을 떼거나 워크플로를 끈 뒤** 이 파일을 돌린다.
-- 반대로 하면 그 사이 실행이 "로그 테이블 미적용" 으로 판정해 상한 반영만 멈춘다
-- (수집 자체는 계속 돈다 — 조용히 틀린 값을 쓰지는 않는다).
-- ============================================================

BEGIN;

DROP INDEX IF EXISTS public.review_source_cap_log_source_idx;
DROP TABLE IF EXISTS public.review_source_cap_log;

COMMIT;

-- 확인
-- SELECT count(*) FROM information_schema.tables
--  WHERE table_schema='public' AND table_name='review_source_cap_log';   -- 기대: 0
-- SELECT key, daily_request_cap FROM public.review_sources ORDER BY key;
--   -- 기대: 롤백 전과 같다. 이 파일은 상한 값을 되돌리지 않는다 —
--   --       이미 올라간 상한은 그대로 남는다(내리려면 사람이 직접 UPDATE 한다).
