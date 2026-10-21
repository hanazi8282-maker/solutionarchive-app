-- 20261022000010_review_sources_stale_reason_text 롤백 — 두 텍스트를 원문으로 되돌린다. 다른 칸은 건드리지 않는다.
BEGIN;

-- appstore: 20260910000002 의 원문 그대로.
UPDATE public.review_sources
   SET disabled_reason = 'robots.txt 위반 — itunes.apple.com Disallow: /*/rss/* 에 걸리는 '
                         || 'RSS customerreviews 경로를 매처 버그로 수집해왔음. fix/robots-wildcard 로 '
                         || '매처 수정 시 러너가 전건 robots-disallow 처리. BYO 붙여넣기 경로로 대체.'
 WHERE key = 'appstore' AND disabled_reason IS NULL;

-- stackexchange: 덧붙인 꼬리만 뗀다.
UPDATE public.review_sources
   SET disabled_reason = left(disabled_reason, position(' | 2026-10-22 약관:' in disabled_reason) - 1)
 WHERE key = 'stackexchange' AND position(' | 2026-10-22 약관:' in disabled_reason) > 1;

COMMIT;
-- 확인: SELECT key, disabled_reason FROM public.review_sources WHERE key IN ('appstore', 'stackexchange');
