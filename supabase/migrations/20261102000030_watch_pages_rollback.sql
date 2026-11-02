-- 20261102000030_watch_pages 롤백 — 대장 테이블을 지운다.
-- ⚠️ DROP TABLE 이다(§10.2 예외 1). 이 마이그 직후, 다른 코드가 이 표를 쓰기 전에만 사람 확인 없이 돌린다.
--    visualping_job_id·last_alert_at 이 채워진 뒤라면 먼저 내보내고 사람 확인을 받는다.

BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.watch_pages WHERE visualping_job_id IS NOT NULL OR last_alert_at IS NOT NULL) THEN
    RAISE EXCEPTION '감시 기록이 쌓인 뒤다 — 내보낸 뒤 사람 확인을 받고 지운다';
  END IF;
END $$;

DROP TABLE IF EXISTS public.watch_pages;

COMMIT;
