-- 커뮤니티 VOC 소스 3종 등록 (round-3) — brunch · clien · fmkorea
-- 어댑터: lib/review/adapters/brunch.ts · clien.ts · fmkorea.ts
-- 실측: docs/review-source-findings.md "커뮤니티 소스 실측 round-3 (2026-09-17)"
--
-- 🟢 비파괴. DDL 없음, 백필 없음. 새 행 3개 + 컬럼 주석 갱신뿐이고
--    기존 행(danawa/appstore/hackernews/damoang/82cook/theqoo/todayhumor)은
--    건드리지 않는다.
--
-- ⛔ Claude 가 실행하지 않는다. 사람이 적용한다(CLAUDE.md §10.1).
--    supabase db query --linked -f 또는 대시보드.
--
-- 세 소스 모두 **enabled=false 로 등록한다.** 킬스위치를 미리 걸어 둔 상태로
-- 시작하는 것이지, 문제가 생기면 그때 끄는 게 아니다.
--
--   update public.review_sources set enabled = true where key = 'brunch';
--   update public.review_sources set enabled = true where key = 'clien';
--   update public.review_sources set enabled = true where key = 'fmkorea';
--
-- ─────────────────────────────────────────────────────────────────
-- ⚠️ 세 소스의 robots 사정이 **전부 다르다.** 같은 값으로 접지 마라.
--
--   brunch  — robots.txt 200. `*` 그룹이 /write·/api/·/search 등을 막고
--             글 경로(/@핸들/번호)는 연다. **`Crawl-delay: 5` 가 있다.**
--             robots.ts 는 Crawl-delay 를 파싱하지 않으므로, 이 지연을 지키는
--             유일한 장치가 아래 min_interval_ms = 5000 이다. 낮추지 마라.
--             (AI 학습 크롤러 그룹은 전면 차단이지만 우리 토큰은 그 목록에 없다.)
--
--   clien   — robots.txt 를 **우리 UA 에게는 404 로 준다**(SP-027).
--             브라우저 UA 로만 www.clien.net/robots.txt 가 200 에 규칙을
--             내려주고, apex(clien.net)는 양쪽 UA 모두 404 다. 호스트 분열이
--             아니라 UA 게이팅이다. 러너는 4xx 를 "규칙 없음 = 허용"으로
--             캐시하므로 사이트가 실제로 건 규칙이 판정에 한 번도 반영되지
--             않는다(CLAUDE.md §7.2 — 초록불이 뜨는 위험한 형태).
--             UA 를 위장해 읽지 않는다. 대신 규칙을 clien.ts 의
--             parseProductRef 가 코드로 내재화한다: 쿼리 금지(`/*?*`),
--             `/service/board/` 접두, sold·hongbo 제외.
--             **그 함수가 유일한 방어선이다.**
--
--   fmkorea — robots.txt 200. `*` 그룹이 `Disallow: /` 로 전부 막고
--             `/best` `/best2` `/humor` 만 연다. 어댑터가 그 셋으로 제한한다.
--             첫 그룹이 anthropic-ai·ClaudeBot·GPTBot 등 AI 학습 크롤러를
--             명시적으로 거부한다 — 우리 토큰은 목록에 없어 기계 판정은
--             allowed 지만, 사이트의 의사를 인지한 채 진행하기로 사람이
--             결정했다(SP-028, damoang SP-025 와 같은 형태).
--
-- ⚠️ 수집 단위도 다르다.
--   brunch  1글 = 리뷰 **1건**. 댓글이 /api/ 뒤에 있고 robots 가 막는다.
--           본문(JSON-LD articleBody)은 **5,000자에서 잘린다**(실측).
--   clien   1글 = 리뷰 **N+1건**. 댓글이 한 페이지에 전부 온다(실측 0·7·17).
--   fmkorea 1글 = 리뷰 **N+1건**. 단, 댓글이 많으면 페이저가 붙고 글 페이지에
--           **마지막 페이지만** 렌더된다. 나머지는 수집되지 않는다(알려진 한계).
-- ─────────────────────────────────────────────────────────────────

INSERT INTO public.review_sources (
  key, display_name, enabled, disabled_reason, health, min_interval_ms, daily_request_cap
) VALUES
  (
    'brunch',
    '브런치 글 본문',
    false,
    '실물 셀렉터·robots 실측 완료. 본문만 수집 — 댓글 API 는 robots 금지(/api/). 본문은 5,000자에서 잘린다. min_interval 5000 은 robots 의 Crawl-delay: 5 를 지키는 유일한 장치다. 사람이 켤 때까지 꺼둠',
    'ok',
    5000,
    50
  ),
  (
    'clien',
    '클리앙 게시글·댓글',
    false,
    '리스크 인지 후 진행 승인(SP-027). robots 를 우리 UA 에게 404 로 감춘다 — 러너가 규칙을 못 보므로 어댑터의 parseProductRef 가 코드로 방어한다. 사람이 켤 때까지 꺼둠',
    'ok',
    3000,
    100
  ),
  (
    'fmkorea',
    '에펨코리아 게시글·댓글',
    false,
    '리스크 인지 후 진행 승인(SP-028). /best·/best2·/humor 범위만 수집. 댓글은 마지막 페이지만 온다(알려진 한계). 사람이 켤 때까지 꺼둠',
    'ok',
    3000,
    100
  )
ON CONFLICT (key) DO NOTHING;

-- ⚠️ COMMENT ON COLUMN 은 **덮어쓰기다.** 20260918000001 의 전체 문구를 그대로
--    옮기고 brunch·clien·fmkorea 만 덧붙였다. 한 줄만 쓰면 기존 SSRF 경고와
--    exhausted·SP-026 안내가 통째로 사라진다.
COMMENT ON COLUMN public.review_targets.product_ref IS
  '소스 안에서 수집 대상을 가리키는 값. danawa=pcode / appstore=<국가>:<앱ID> / hackernews=q:<키워드> / '
  'damoang·82cook·theqoo·todayhumor·brunch·clien·fmkorea=url:<글 경로>. '
  '어느 값을 붙일지는 사람이 정한다 — 시스템이 키워드로 상품을 검색해 후보 중 하나를 자동 선택하지 않는다. '
  'hackernews 의 q: 는 상품 식별자가 아니라 질의 자체이며, 한 질의에 여러 스레드가 걸리는 것이 정상 동작이다. '
  '커뮤니티 7종의 url: 은 **경로만** 담는다(호스트는 어댑터 상수). 호스트를 넣게 하면 SSRF 가 되므로 '
  'lib/review/adapters/url-ref.ts 가 ''..'' ''//'' ''@'' 와 공백을 거부한다. '
  'brunch 만 예외로 그 공용 함수를 못 쓴다 — 글 경로가 /@핸들/번호 라 ''@'' 에 걸린다. 대신 brunch.ts 가 '
  '경로 전체를 ^/@<핸들>/<숫자>$ 화이트리스트로 더 좁게 검증한다(공용 함수를 완화하지 않는다). '
  '이 일곱 소스는 1글=1요청이라 수집 후 타깃이 status=exhausted 로 닫힌다 — 나중에 달린 댓글을 받으려면 '
  '사람이 status=''active'' 로 되돌려야 한다(자동 재활성화 없음). '
  'theqoo·todayhumor·brunch 는 **본문 1건만** 적재된다 — 앞 둘은 댓글이 AJAX 라서, brunch 는 댓글 API 가 '
  'robots 금지(/api/)라서다. 댓글 0건은 고장이 아니다. '
  'todayhumor 의 경로는 쿼리형이다(/board/view.php?table=..&no=..). 이 사이트에 robots.txt 가 생기고 '
  '거기 쿼리 규칙이 들어가면 러너가 그 규칙을 못 본다(pathname 만 판정 — SP-026). '
  'clien 은 반대로 robots 에 ''Disallow: /*?*'' 가 있어 쿼리형 ref 를 어댑터가 거부한다. 그 robots 를 '
  '우리 UA 로는 못 읽으므로(404, SP-027) 어댑터의 가드가 유일한 방어선이다 — 넓히지 마라. '
  'fmkorea 는 robots 가 /best·/best2·/humor 만 열어 그 밖의 경로를 어댑터가 거부하며(SP-028), '
  '댓글이 많은 글은 마지막 댓글 페이지만 수집된다(알려진 한계 — 차액을 파싱 실패로 세지 않는다).';

-- 확인용 (실행 후 눈으로 볼 것):
--   select key, enabled, health, min_interval_ms, daily_request_cap
--   from public.review_sources order by key;
--
-- 기대: 82cook / appstore / brunch / clien / damoang / danawa / fmkorea /
--       hackernews / theqoo / todayhumor (10행),
--       brunch 가 enabled=false · 5000 · 50,
--       clien·fmkorea 가 enabled=false · 3000 · 100.
