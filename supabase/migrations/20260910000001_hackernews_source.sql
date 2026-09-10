-- Hacker News (Algolia HN Search API) 소스 등록
-- 어댑터: lib/review/adapters/hackernews.ts
-- 🟢 비파괴. 새 행 1개 + 주석 갱신. 기존 danawa/appstore 행과 무관하다.
--
-- 남헌 2026-09-10 결정 1: Algolia HN Search API 이용 가능 판단은 "명시적 허용 확인"이
-- 아니라 "금지 문구 미발견"이다(evidence_grade=B, docs/review-source-findings.md 참조).
-- 이 판단의 무게에 맞춰 **enabled=false 로 등록**한다 — 사람이 review_sources 를
-- 직접 UPDATE 해서 켜야 실제 수집이 시작된다. 킬스위치를 "이미 걸어둔 상태"로 시작하는
-- 것이지, 나중에 문제가 생기면 그때 끄는 게 아니다.
--
-- 이 세션에서 이 판단이 다르게 읽혔을 가능성이 있으면(예: enabled=true 로 바로
-- 시작하길 원했다면) 대시보드에서 한 줄로 뒤집을 수 있다:
--   update public.review_sources set enabled = true where key = 'hackernews';

INSERT INTO public.review_sources (
  key, display_name, enabled, disabled_reason, health, min_interval_ms, daily_request_cap
) VALUES (
  'hackernews',
  'Hacker News 댓글 (Algolia 검색)',
  false,  -- 사람이 켜야 수집 시작. 위 결정 1 참조.
  'evidence_grade=B(금지 문구 미발견, 명시적 허용 확인 아님) — 사람이 검토 후 활성화',
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
-- 기대: appstore / danawa / hackernews 세 행, hackernews 만 enabled=false.
