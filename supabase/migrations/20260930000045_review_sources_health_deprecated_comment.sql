-- ============================================================
-- 20260930000045_review_sources_health_deprecated_comment — review_sources 건강도 3컬럼에 DEPRECATED 주석만 단다
--
-- ⛔ 미적용, 오케스트레이터가 적용. 서브에이전트가 만든 파일이다(CLAUDE.md §10.2 — 판단 주체가 아니다).
--
-- 왜: 2026-09-30 #373 이후 무인 러너가 review_sources.health·health_detail·health_checked_at 을 쓰지 않는다.
--   출처는 review_collection_runs.health_after(lib/review/latest-health.ts). 옛 값이 낡은 채 남아 있어 누가 읽으면
--   틀린 건강도를 믿게 된다 — 그래서 DB 에서도 보이게 주석을 단다. 정리(삭제)는 다음 분기(남헌 2026-09-30).
--
-- 🟢 비파괴: COMMENT ON COLUMN 만. 컬럼 추가·변경·삭제·데이터 UPDATE 0건.
--    DROP COLUMN 은 되돌리기 어려운 삭제 = §10.2 사람 판단 예외라 이 파일은 하지 않는다.
--
-- 적용 전(롤백 대비) 현재 주석을 남긴다:
--   SELECT a.attname, col_description('public.review_sources'::regclass, a.attnum)
--     FROM pg_attribute a
--    WHERE a.attrelid = 'public.review_sources'::regclass
--      AND a.attname IN ('health', 'health_detail', 'health_checked_at');
-- ============================================================

BEGIN;

COMMENT ON COLUMN public.review_sources.health IS
  'DEPRECATED 2026-09-30 — #373 이후 무인 러너가 쓰지 않는다. 출처는 review_collection_runs.health_after(lib/review/latest-health.ts). 정리는 다음 분기(남헌 2026-09-30). 이 값은 낡았다 — 읽지 말 것.';
COMMENT ON COLUMN public.review_sources.health_detail IS
  'DEPRECATED 2026-09-30 — #373 이후 무인 러너가 쓰지 않는다. 출처는 review_collection_runs.health_after(판정 사유는 그 실행의 Actions 요약). 정리는 다음 분기(남헌 2026-09-30).';
COMMENT ON COLUMN public.review_sources.health_checked_at IS
  'DEPRECATED 2026-09-30 — #373 이후 무인 러너가 쓰지 않는다. 출처는 review_collection_runs.health_after 의 started_at. 정리는 다음 분기(남헌 2026-09-30).';

COMMIT;

-- 확인(양성 3 · 음성 0):
--   SELECT a.attname, col_description('public.review_sources'::regclass, a.attnum) LIKE 'DEPRECATED 2026-09-30%' AS deprecated
--     FROM pg_attribute a
--    WHERE a.attrelid = 'public.review_sources'::regclass
--      AND a.attname IN ('health', 'health_detail', 'health_checked_at', 'enabled');
--   → health·health_detail·health_checked_at = true, enabled = false(음성 — 다른 컬럼은 건드리지 않았다)
