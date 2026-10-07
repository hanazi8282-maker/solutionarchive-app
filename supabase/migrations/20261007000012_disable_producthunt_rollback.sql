-- 롤백: 20261007000012_disable_producthunt — 2026-09-28 활성화 상태(enabled=true, disabled_reason·disabled_at NULL)로 되돌린다.
-- 켜는 것은 CLAUDE.md §10.2 예외 4번(새 법적 리스크) = 사람 판단이다. 되돌리기 전에 약관 상황(상업 이용 허가)을 먼저 확인할 것.
-- health·health_detail 은 정방향이 건드리지 않았으므로 여기서도 건드리지 않는다.
UPDATE public.review_sources
   SET enabled = true,
       disabled_reason = NULL,
       disabled_at = NULL
 WHERE key = 'producthunt';

-- 확인: SELECT key, enabled, disabled_reason, disabled_at FROM public.review_sources WHERE key = 'producthunt';
--   기대: producthunt · true · NULL · NULL
