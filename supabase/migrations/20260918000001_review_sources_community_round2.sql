-- 커뮤니티 VOC 소스 2종 등록 (round-2) — theqoo · todayhumor
-- 어댑터: lib/review/adapters/theqoo.ts · lib/review/adapters/todayhumor.ts
-- 실측: docs/review-source-findings.md "커뮤니티 소스 실측 round-2 (2026-09-16)"
--
-- 🟢 비파괴. DDL 없음, 백필 없음. 새 행 2개 + 컬럼 주석 갱신뿐이고
--    기존 행(danawa/appstore/hackernews/damoang/82cook)은 건드리지 않는다.
--
-- ⛔ Claude 가 실행하지 않는다. 사람이 적용한다(CLAUDE.md §10.1).
--    supabase db query --linked -f 또는 대시보드.
--
-- ─────────────────────────────────────────────────────────────────
-- 두 소스 모두 robots.txt 가 **없다**(2026-09-16 실측, HTTP 404).
-- 못 볼 규칙이 없다는 뜻이지 "마음대로 해도 된다"는 뜻이 아니다.
-- 그래서 damoang·82cook 과 같이 **enabled=false 로 등록한다.**
-- 킬스위치를 미리 걸어 둔 상태로 시작하는 것이지, 문제가 생기면 그때
-- 끄는 게 아니다.
--
--   update public.review_sources set enabled = true where key = 'theqoo';
--   update public.review_sources set enabled = true where key = 'todayhumor';
--
-- ⚠️ 두 소스의 "확인 불가"는 **사유가 다르다.** 같은 값으로 접지 마라.
--    theqoo     — 이용약관 원문을 읽었다(https://theqoo.net/service, 200,
--                 평문 6,315자). 크롤링·봇·AI·재가공 조항 0건. 남은 건
--                 "우리가 읽은 게 전부인가"라는 사람 판단뿐이다.
--    todayhumor — **이용약관 페이지를 찾지 못했다.** 푸터에 링크가 없고
--                 /member/agreement.php · /member/join_agreement.php 는 404.
--                 /member/privacy.php(200, 3,123자)에도 관련 조항 0건.
--                 이건 허용이 아니라 확인 불가다(CLAUDE.md §7.1).
-- ─────────────────────────────────────────────────────────────────
--
-- ⚠️ 두 소스 다 **본문 전용**이다. 댓글이 정적 HTML 에 없다(양쪽 다 AJAX).
--    그래서 1글 = 리뷰 1건이다. damoang·82cook 처럼 N+1 건이 아니다.
--
-- 간격·상한은 damoang·82cook 과 같게 둔다. 공식 API 가 아니라 커뮤니티다.
--   min_interval_ms   3000
--   daily_request_cap 100   (1글=1요청이므로 하루 100글)
-- 라이브 프로브 실측(2026-09-16, 글 1건씩): theqoo 40ms / 31.5KB,
-- todayhumor 446ms / 125.9KB. 둘 다 타임아웃과 거리가 멀어, todayhumor 만
-- 5000/50 으로 낮추는 조정은 하지 않았다.

INSERT INTO public.review_sources (
  key, display_name, enabled, disabled_reason, health, min_interval_ms, daily_request_cap
) VALUES
  (
    'theqoo',
    '더쿠 게시글',
    false,
    'robots.txt 없음(실측 404) + 이용약관 전문 6,315자 확인, 크롤링·봇·AI·재가공 조항 0건. 셀렉터 실측 완료(본문 전용 — 댓글은 AJAX). 사람이 켠다',
    'ok',
    3000,
    100
  ),
  (
    'todayhumor',
    '오늘의유머 게시글',
    false,
    'robots.txt 없음(양 오리진 실측 404). 이용약관 페이지를 찾지 못했다 — 확인 불가이지 허용이 아니다. 셀렉터 실측 완료(본문 전용 — 댓글은 AJAX). 사람이 판단한 뒤 켠다',
    'ok',
    3000,
    100
  )
ON CONFLICT (key) DO NOTHING;

-- ⚠️ COMMENT ON COLUMN 은 **덮어쓰기다.** 20260917000001 의 전체 문구를 그대로
--    옮기고 theqoo·todayhumor 만 덧붙였다. 한 줄만 쓰면 기존 SSRF 경고와
--    exhausted 안내가 통째로 사라진다.
COMMENT ON COLUMN public.review_targets.product_ref IS
  '소스 안에서 수집 대상을 가리키는 값. danawa=pcode / appstore=<국가>:<앱ID> / hackernews=q:<키워드> / '
  'damoang·82cook·theqoo·todayhumor=url:<글 경로>. '
  '어느 값을 붙일지는 사람이 정한다 — 시스템이 키워드로 상품을 검색해 후보 중 하나를 자동 선택하지 않는다. '
  'hackernews 의 q: 는 상품 식별자가 아니라 질의 자체이며, 한 질의에 여러 스레드가 걸리는 것이 정상 동작이다. '
  '커뮤니티 4종의 url: 은 **경로만** 담는다(호스트는 어댑터 상수). 호스트를 넣게 하면 SSRF 가 되므로 '
  'lib/review/adapters/url-ref.ts 가 ''..'' ''//'' ''@'' 와 공백을 거부한다. '
  '이 네 소스는 1글=1요청이라 수집 후 타깃이 status=exhausted 로 닫힌다 — 나중에 달린 댓글을 받으려면 '
  '사람이 status=''active'' 로 되돌려야 한다(자동 재활성화 없음). '
  'theqoo·todayhumor 는 댓글이 정적 HTML 에 없어(AJAX) **본문 1건만** 적재된다 — 댓글 0건은 고장이 아니다. '
  'todayhumor 의 경로는 쿼리형이다(/board/view.php?table=..&no=..). 이 사이트에 robots.txt 가 생기고 '
  '거기 쿼리 규칙이 들어가면 러너가 그 규칙을 못 본다(pathname 만 판정 — SP-026).';

-- 확인용 (실행 후 눈으로 볼 것):
--   select key, enabled, health, min_interval_ms, daily_request_cap
--   from public.review_sources order by key;
--
-- 기대: 82cook / appstore / damoang / danawa / hackernews / theqoo / todayhumor,
--       theqoo 와 todayhumor 가 enabled=false · 3000 · 100.
