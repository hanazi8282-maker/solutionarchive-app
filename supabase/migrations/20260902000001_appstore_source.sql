-- ============================================================
-- App Store 고객 리뷰 소스 등록
--
-- 어댑터: lib/review/adapters/appstore.ts
-- 실측 근거: docs/review-source-findings.md "2차 소스 실측"
--
-- 🟢 비파괴. 새 행 1개만 넣는다. 기존 danawa 행과 무관하다.
--
-- ⚠️ 이 행이 없으면 App Store 타깃을 한 건도 못 넣는다.
--    review_targets.source_key 와 analysis_inputs.source_key 가 둘 다
--    review_sources(key) 를 FK 로 본다.
--
-- ⛔ Claude 가 실행하지 않는다. 사람이 Supabase 대시보드에서 실행한다.
-- ============================================================

INSERT INTO public.review_sources (
  key,
  display_name,
  enabled,
  health,
  min_interval_ms,
  daily_request_cap
) VALUES (
  'appstore',
  'App Store 고객 리뷰',
  true,
  'ok',
  -- 애플이 공개한 요청 제한이 없다. 다나와(4000ms)보다는 짧게 두되
  -- 1초 미만으로 내리지 않는다. 남의 서버다.
  2000,
  -- 앱 하나당 최대 10페이지(애플 상한)다. 앱 20개를 훑어도 200건이면
  -- 하루 한 바퀴가 돈다.
  200
)
ON CONFLICT (key) DO NOTHING;

-- 확인용 (실행 후 눈으로 볼 것):
--   select key, enabled, health, min_interval_ms, daily_request_cap
--   from public.review_sources order by key;
--
-- 기대: danawa / appstore 두 행.
