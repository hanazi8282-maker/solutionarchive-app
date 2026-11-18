-- 끄는 짝(스택익스체인지). 모은 글은 지우지 않는다.
BEGIN;
UPDATE public.review_sources SET enabled = false, disabled_reason = '남헌 결정으로 끔(20261119000011) — 약관 AUP Content Scraping/Bot Policy', disabled_at = now() WHERE key = 'stackexchange';
COMMIT;
