-- 20261017000120_stackexchange_source 롤백 — 등록만 한 꺼진 행이라 끈 상태를 확인하고 램프를 멈춘다. 멱등. DELETE 없음.

BEGIN;

UPDATE public.review_sources
   SET enabled = false,
       disabled_reason = '20261017000120 롤백 — v71ad Stack Exchange 소스 중단',
       disabled_at = now()
 WHERE key = 'stackexchange';

UPDATE public.review_source_ramp
   SET cap_base = NULL, daily_request_target = NULL, frozen_until = '2099-12-31T00:00:00Z', changed_at = now(),
       reason = '20261017000120 롤백 — 퍼센트 램프 정지·동결'
 WHERE source_key = 'stackexchange';

COMMIT;

-- 확인: SELECT key, enabled FROM public.review_sources WHERE key = 'stackexchange';   -- f
