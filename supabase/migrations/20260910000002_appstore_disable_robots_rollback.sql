-- 롤백: appstore 소스 다시 활성화
-- ⛔ Claude 가 실행하지 않는다. 사람이 판단해서 적용한다.
--
-- ⚠️ 그냥 되돌리지 마라. appstore 를 다시 켜려면 robots.txt 를 준수하는 수집
--    경로가 있어야 한다. 지금 어댑터 경로(/<국가>/rss/customerreviews/...)는
--    itunes.apple.com 의 Disallow: /*/rss/* 에 걸린다 — 켜도 러너가 전건
--    robots-disallow 로 건너뛴다.

UPDATE public.review_sources
   SET enabled = true,
       disabled_reason = NULL,
       disabled_at = NULL
 WHERE key = 'appstore';
