-- ============================================================
-- 20260930000002_case_saves — 롤백
--
-- 🔴 파괴적이다. 실행하면 사라진다:
--     · case_saves 전 행 (사람들이 저장해 둔 케이스 목록. 재생성 경로가 없다 —
--       무엇을 저장했는지는 그 사람만 안다)
--
-- 그래서 CLAUDE.md §10.2 의 "되돌리기 어려운 삭제" 예외에 해당한다 — **사람만 실행한다.**
-- 세션이 자체 판단으로 돌리지 않는다.
--
-- 지우기 전에 남길 것 (없으면 이 파일을 돌리지 마라):
--   SELECT s.user_email, c.slug, s.created_at
--     FROM public.case_saves s JOIN public.case_studies c ON c.id = s.case_study_id
--    ORDER BY s.user_email, s.created_at;
-- ============================================================

BEGIN;

DROP TABLE IF EXISTS public.case_saves;

COMMIT;

-- 확인
-- SELECT count(*) FROM information_schema.tables
--  WHERE table_schema='public' AND table_name='case_saves';   -- 기대: 0
