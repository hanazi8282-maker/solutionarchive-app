-- App Store 소스 즉시 비활성화 — robots.txt 위반 수집이 드러남
--
-- 근거: lib/review/robots.ts 가 와일드카드·끝앵커를 구현하지 않던 버그 때문에
-- itunes.apple.com 의 `Disallow: /*/rss/*` 가 조용히 무시돼, appstore 어댑터가
-- 때리는 `/<국가>/rss/customerreviews/...` 경로가 지금까지 "허용"으로 오판정되어
-- robots 위반 상태로 수집돼왔다. fix/robots-wildcard(PR #23) 로 매처를 고치면
-- 러너가 이 소스의 모든 요청을 robots-disallow 로 건너뛴다 — 즉, 고친 순간부터
-- appstore 는 어차피 한 건도 못 모은다. 레지스트리에서도 명시적으로 끈다.
--
-- 🟢 비파괴. review_sources 한 행의 플래그만 바꾼다. 이미 모은 App Store 리뷰
--    데이터(review_fingerprints / analysis_inputs 등)는 건드리지 않는다 —
--    삭제·격리하지 않고 그대로 둔다.
--
-- ⛔ Claude/무인 루프가 실행하지 않는다(CLAUDE.md §10.1). 사람이 SolutionArchive
--    Supabase 대시보드에서 실행한다. MCP 는 이 리포가 아니라 Dothegy OS 를 본다.
--
-- 되돌리기: App Store 경쟁사 리뷰는 당분간 BYO(사용자 직접 붙여넣기) 경로로만
--    커버한다. 공식 API 전환(App Store Connect API 는 본인 앱만) · 유료 애그리게이터
--    대체는 하지 않기로 결정됨. 다시 켜려면 robots 를 준수하는 수집 경로가 필요하다.

UPDATE public.review_sources
   SET enabled = false,
       disabled_reason = 'robots.txt 위반 — itunes.apple.com Disallow: /*/rss/* 에 걸리는 '
                         || 'RSS customerreviews 경로를 매처 버그로 수집해왔음. fix/robots-wildcard 로 '
                         || '매처 수정 시 러너가 전건 robots-disallow 처리. BYO 붙여넣기 경로로 대체.',
       disabled_at = now()
 WHERE key = 'appstore';

-- 확인용 (실행 후 눈으로 볼 것):
--   select key, enabled, disabled_reason, disabled_at
--   from public.review_sources order by key;
--
-- 기대: appstore.enabled = false, disabled_reason/disabled_at 채워짐.
--       danawa 는 그대로 enabled = true.
