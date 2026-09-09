-- Hacker News (Algolia HN Search API) 소스 등록
-- 어댑터: lib/review/adapters/hackernews.ts
-- 🟢 비파괴. 새 행 1개 + 주석 갱신. 기존 danawa/appstore 행과 무관하다.
-- ⛔ Claude 가 실행하지 않는다. 사람이 supabase db query --linked -f 로 적용한다.

INSERT INTO public.review_sources (
  key, display_name, enabled, health, min_interval_ms, daily_request_cap
) VALUES (
  'hackernews',
  'Hacker News 댓글 (Algolia 검색)',
  true,
  'ok',
  2000,
  200
)
ON CONFLICT (key) DO NOTHING;

COMMENT ON COLUMN public.review_targets.product_ref IS
  '소스 안에서 수집 대상을 가리키는 값. danawa=pcode / appstore=<국가>:<앱ID> / hackernews=q:<키워드>. '
  '어느 값을 붙일지는 사람이 정한다 — 시스템이 키워드로 상품을 검색해 후보 중 하나를 자동 선택하지 않는다. '
  'hackernews 의 q: 는 상품 식별자가 아니라 질의 자체이며, 한 질의에 여러 스레드가 걸리는 것이 정상 동작이다.';

-- 확인용 (실행 후 눈으로 볼 것):
--   select key, enabled, health, min_interval_ms, daily_request_cap
--   from public.review_sources order by key;
--
-- 기대: appstore / danawa / hackernews 세 행.
