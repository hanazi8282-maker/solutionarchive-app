-- 20260930000035_relevance_translations 롤백 — 트리거·함수·캐시 테이블 2개를 지운다.
-- 사라지는 것은 번역·배경 캐시뿐이다(원문·판정·채점은 다른 테이블). 다시 적용하면 배치가 다시 만든다.

DROP TRIGGER IF EXISTS relevance_translations_follow_purge ON public.analysis_inputs;
DROP FUNCTION IF EXISTS public.relevance_translations_follow_purge();
DROP TABLE IF EXISTS public.relevance_translations;
DROP TABLE IF EXISTS public.relevance_product_backgrounds;

-- 확인: select count(*) from information_schema.tables
--        where table_schema='public' and table_name in ('relevance_translations','relevance_product_backgrounds');  -- 0
--       select count(*) from pg_trigger where tgname='relevance_translations_follow_purge';                          -- 0
