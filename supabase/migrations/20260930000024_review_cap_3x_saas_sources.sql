-- ============================================================
-- 20260930000024_review_cap_3x_saas_sources
--
-- 활성 SaaS 소스(HN + 커뮤니티 게시판) daily_request_cap 3배 — 남헌 2026-09-28 지시.
-- 소스별 안전성 확인(CEO-STAFF 실측, 2026-09-28):
--   · 지난 7일 review_collection_runs: 어느 소스도 상한에 닿지 않았다(최대 사용 HN 126/200, 게시판 ≤48).
--     오류는 okky 1건(자체 지문 기록 Bad Gateway)뿐, 403/429 0건. todayhumor 외 차단 이력 없음(docs/review-source-findings*.md).
--   · robots.txt Crawl-delay: okky 1s · brunch 1~2s · 나머지 없음 — 모두 현재 min_interval_ms(2~5s)보다 짧다.
--   · 요청 속도(min_interval_ms)는 바꾸지 않는다. 사이트가 느끼는 초당 부하는 그대로고, 늘어나는 건 하루 총량 상한뿐이다.
--   · HN 은 Algolia 공개 API(IP 당 시간 10,000 요청 공개 한도) — 600/일은 그 0.3% 미만.
-- 제외: danawa(000023 에서 축소, SaaS 아님) · youtube(API 쿼터 별도, SaaS 게시판 아님) · tumblbug(크라우드펀딩, 7일 요청 1).
-- 현재값 가드: 야간 request-cap 잡이 그사이 값을 바꿨으면 그 행은 건너뛴다(0행 = 재확인 필요).
-- 🟢 비파괴 UPDATE 10행. 롤백 파일 있음.
-- ============================================================
UPDATE public.review_sources SET daily_request_cap = v.new_cap
  FROM (VALUES
    ('hackernews', 200, 600),
    ('clien',      154, 462),
    ('bobaedream', 112, 336),
    ('82cook',     123, 369),
    ('okky',       100, 300),
    ('velog',      100, 300),
    ('damoang',    100, 300),
    ('theqoo',     100, 300),
    ('fmkorea',    100, 300),
    ('brunch',      50, 150)
  ) AS v(key, old_cap, new_cap)
 WHERE review_sources.key = v.key AND review_sources.daily_request_cap = v.old_cap AND review_sources.enabled;

-- 확인: SELECT key, daily_request_cap FROM public.review_sources WHERE key IN ('hackernews','clien','bobaedream','82cook','okky','velog','damoang','theqoo','fmkorea','brunch') ORDER BY key;
