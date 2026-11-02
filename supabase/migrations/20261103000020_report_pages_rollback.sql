-- 20261103000020_report_pages 롤백 — 결론서 링크 테이블 2개를 지운다.
-- ⚠️ DROP TABLE 이다(§10.2 예외 1). 게시된 결론서가 0건일 때만 사람 확인 없이 돌린다.
--    1건이라도 있으면 아래 가드가 멈춘다 — 그때는 회수(revoked_at)로 충분한지 먼저 보고, 지울 거면 사람 확인을 받는다.
--    링크만 끄려면 이 파일 말고 코드 revert(라우트·공개 경로 제거)로 충분하다 — 표는 남겨도 아무도 못 읽는다.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.report_pages') IS NOT NULL AND EXISTS (SELECT 1 FROM public.report_pages) THEN
    RAISE EXCEPTION 'report_pages 에 게시 행이 있다 — 사람 확인 뒤 지운다';
  END IF;
END $$;

DROP TABLE IF EXISTS public.report_views;
DROP TABLE IF EXISTS public.report_pages;

COMMIT;
