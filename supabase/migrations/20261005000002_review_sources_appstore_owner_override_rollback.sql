-- 롤백: 20261005000002_review_sources_appstore_owner_override — appstore 를 다시 끈다.
-- 정방향이 disabled_reason·disabled_at 을 건드리지 않았으므로 그 두 값은 20260910000002 때 그대로다.

BEGIN;

UPDATE public.review_sources
   SET enabled = false,
       robots_status = NULL,
       override = NULL,
       quote_allowed = true,
       last_test_result = NULL
 WHERE key = 'appstore';

COMMIT;

-- 확인: SELECT key, enabled, override, quote_allowed, disabled_reason FROM public.review_sources WHERE key = 'appstore';
--   기대: false · NULL · true · 'robots.txt 위반 — …'(20260910000002 문구)
