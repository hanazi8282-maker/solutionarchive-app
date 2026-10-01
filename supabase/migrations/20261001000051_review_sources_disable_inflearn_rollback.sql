-- ============================================================
-- 20261001000051_review_sources_disable_inflearn — 롤백: inflearn 다시 활성화
--
-- ⛔ 미적용, 오케스트레이터가 판단. 서브에이전트·무인 루프는 실행하지 않는다.
-- ⚠️ 남헌 결정(2026-10-01 v10)으로 끈 소스다. 되돌리는 것은 그 결정을 뒤집는 일이라 세션 판단으로 하지 않는다(§10.2).
-- ============================================================

BEGIN;

DO $$
DECLARE n int;
BEGIN
  UPDATE public.review_sources
     SET enabled = true, disabled_reason = NULL, disabled_at = NULL
   WHERE key = 'inflearn';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN
    RAISE EXCEPTION 'inflearn rollback: expected exactly 1 row, got %', n;
  END IF;
END $$;

COMMIT;

-- 확인: SELECT key, enabled, disabled_reason, disabled_at FROM public.review_sources WHERE key = 'inflearn';
