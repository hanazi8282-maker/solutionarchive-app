-- ============================================================
-- 20260930000045_review_sources_health_deprecated_comment — 롤백
--
-- ⛔ 미적용, 오케스트레이터가 적용. 서브에이전트·무인 루프는 실행하지 않는다.
-- 🟢 주석만 원래대로 돌린다. health 는 20260829000003 의 원문, 나머지 둘은 원래 주석이 없었다(NULL).
--    적용 전에 뽑아 둔 현재 주석(본 파일 헤더의 SELECT)이 이것과 다르면 그 값으로 바꿔 넣는다.
-- ============================================================

BEGIN;

COMMENT ON COLUMN public.review_sources.health IS
  'ok / degraded(연속 3회 신규 0건) / broken(파싱 성공률 0.8 미만 또는 403·429). broken 은 자동으로 enabled=false 를 동반한다.';
COMMENT ON COLUMN public.review_sources.health_detail IS NULL;
COMMENT ON COLUMN public.review_sources.health_checked_at IS NULL;

COMMIT;
