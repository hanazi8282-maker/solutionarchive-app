-- ============================================================
-- 20260930000017_reactivate_todayhumor
--
-- todayhumor 소스 재활성화 — 2026-09-24 11:36 UTC 수집에서 차단 응답 1건(403/429)을 받아
-- 러너가 자동으로 enabled=false·health='broken' 으로 내렸다. 남헌 2026-09-25 결정으로 다시 켠다.
-- (DB 직접 UPDATE 금지 — 마이그레이션 파일로만. 남헌 지시.)
--
-- 🟢 비파괴. review_sources 1행의 enabled·health·disabled_reason·disabled_at 만 되돌린다.
--    daily_request_cap·robots 판정·타깃은 건드리지 않는다. 다시 403 을 받으면 러너가 같은 경로로 다시 내린다 —
--    그 결과(재차단 여부)는 재활성화 뒤 첫 수집 로그로 확인한다.
-- 롤백: 20260930000017_reactivate_todayhumor_rollback.sql (차단 당시 값으로 되돌린다)
-- ============================================================

UPDATE public.review_sources
   SET enabled = true,
       health = 'ok',
       health_detail = '2026-09-25 남헌 결정으로 재활성화 (000017). 직전 차단: 2026-09-24 403/429 1건',
       health_checked_at = now(),
       disabled_reason = NULL,
       disabled_at = NULL
 WHERE key = 'todayhumor'
   AND enabled = false;

-- 확인 쿼리
--   SELECT key, enabled, health, disabled_at FROM public.review_sources WHERE key = 'todayhumor';
--   기대: enabled = true, health = 'ok', disabled_at IS NULL
