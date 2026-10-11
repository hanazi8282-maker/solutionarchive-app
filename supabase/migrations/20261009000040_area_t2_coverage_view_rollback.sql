-- ============================================================
-- 20261009000040_area_t2_coverage_view_rollback
--
-- 읽기 뷰 하나를 지운다. 데이터 없음 · 테이블·열 무변경. 재실행 무해(IF EXISTS).
-- 지운 뒤 scripts/target-supply.mjs 는 영역 커버리지 열을 '확인 불가'로 찍는다(PGRST205 → 0 이 아니다).
-- ⚠️ 미적용 — 서브에이전트가 만든 파일이다.
-- ============================================================

BEGIN;
SET LOCAL lock_timeout = '5s';
DROP VIEW IF EXISTS public.v_area_t2_coverage;
COMMIT;

-- 확인: SELECT count(*) FROM information_schema.views WHERE table_schema = 'public' AND table_name = 'v_area_t2_coverage';  -- 0
