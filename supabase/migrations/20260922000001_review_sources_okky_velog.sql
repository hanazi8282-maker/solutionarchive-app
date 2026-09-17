-- VOC 소스 2종 등록 (round-5 B군 채택분) — okky · velog
-- 어댑터: lib/review/adapters/okky.ts · velog.ts
-- 실측: docs/review-source-findings-round5-b.md
--       + 구현 단계 실측 2026-09-18 (OKKY 글 15건 · 벨로그 글 3건)
--
-- 🟢 비파괴. DDL 없음, 백필 없음. 새 행 2개 + 컬럼 주석 갱신뿐이고
--    기존 13행(danawa/appstore/hackernews/damoang/82cook/theqoo/todayhumor/
--    brunch/clien/fmkorea/bobaedream/tumblbug/naver_blog_post)은 건드리지 않는다.
--
-- ⛔ **이 파일은 아직 적용되지 않았다(미적용).** Claude 가 실행하지 않는다 —
--    서브에이전트는 어떤 경우에도 적용하지 않고(CLAUDE.md §10.2), 대화형
--    세션이 남헌 승인을 받아 적용한다(§10.1 · 2026-09-17 개정).
--    supabase db query --linked -f 또는 대시보드.
--
-- 두 소스 모두 **enabled=false 로 등록한다.** 킬스위치를 미리 걸어 둔 상태로
-- 시작하는 것이지, 문제가 생기면 그때 끄는 게 아니다.
--
--   update public.review_sources set enabled = true where key = 'okky';
--   update public.review_sources set enabled = true where key = 'velog';
--
-- ─────────────────────────────────────────────────────────────────
-- ⚠️ 두 소스의 근거가 **성질이 다르다.** 같은 문장으로 접지 마라.
--
--   okky  — robots.txt 200 · 1,733B · 그룹 19개. 리포 파서로 판정:
--           `/articles/<번호>` 허용, `/api/` 금지, `/users/*/articles` 금지.
--           ⛔ 그래서 **목록을 API 로 받을 수 없다.** 글 URL 은 sitemap.xml 에서
--           얻는다(목록 페이지는 CSR 이라 링크가 안 나온다).
--           약관(okky.kr/legal/terms, 평문 6,964자)에 크롤·로봇·스크래핑·마이닝·
--           AI 조항 **0건**. 라이선스 조항은 오히려 "외부 사이트에서의 검색,
--           수집 및 링크 허용"을 적어 뒀다. damoang(SP-025)·fmkorea(SP-028)·
--           tumblbug(SP-031) 처럼 "리스크 인지 후 진행" 한 소스가 **아니다.**
--           robots 의 AI 크롤러 처우도 반대다 — GPTBot·ClaudeBot·Claude-User 를
--           Googlebot 과 같은 그룹에 넣어 일반 규칙만 적용한다.
--
--   velog — robots.txt 200 이지만 **57바이트**고 `User-agent: *` 한 줄뿐,
--           규칙이 0개다. 파서 판정은 `allowed=true (일치하는 규칙 없음)`.
--           ⚠️ **그건 "금지하지 않았다"일 뿐 초대가 아니다.** 이 행의 채택 근거는
--           robots 가 아니라 **이용약관**이다: velog.io/policy/terms 평문 4,193자
--           (제1조~제12조 + 부칙 2018.8.25) 전문 확인, 크롤·로봇·자동화·스크래핑·
--           마이닝·수집·복제 **전부 0건**, 준거법 대한민국법.
--           (round-5 조사가 받은 robots 24개 중 "`*` 그룹은 있는데 규칙 0개"인
--            곳이 velog·docs.github.com 둘이었다. 그 형태를 허가로 읽지 마라.)
--
-- ⚠️ 수집 단위·한계도 다르다.
--   okky  1글 = 리뷰 **N+1건**(본문 1 + 댓글 N). 댓글 전문이 JSON-LD
--         `comment[]` 로 온다 — 다른 커뮤니티 7종이 전부 댓글에서 뭔가를
--         잃은 것과 달리 잃는 게 없다. 단 **`comment[]` 는 중첩**이고 글의
--         `commentCount` 는 대댓글까지 합친 총합이다(실측 1564214: 6 = 최상위 2
--         + 대댓글 4). 평탄화해서 대조해야 가짜 실패가 안 난다.
--   velog 1글 = 리뷰 **1건**. 본문은 `__APOLLO_STATE__` 의 **원문 마크다운**이라
--         브런치의 5,000자 절단 같은 천장이 없다(실측 최대 17,836자).
--         `released_at` 이 **UTC ISO** 다 — KST 변환 없이 앞 10자를 쓰면 증분
--         종료가 하루 어긋난다(실측 3건 중 2건이 어긋났다).
--
-- ⚠️ **측정 조건 한계(두 소스 공통).** 위 실측은 전부 한국 가정용 IP 와 개발
--    머신에서 쟀다. 실제 수집은 GitHub Actions 러너(Azure egress)에서 돈다.
--    두 사이트가 데이터센터 IP 를 다르게 대하는지 **확인하지 못했다.**
--    켠 첫날은 dry-run 으로 돌려 응답 코드를 눈으로 보고 나서 켜라
--    (CLAUDE.md §7.1 — 부품 테스트를 통합의 근거로 쓰지 않는다).
-- ─────────────────────────────────────────────────────────────────

INSERT INTO public.review_sources (
  key, display_name, enabled, disabled_reason, health, min_interval_ms, daily_request_cap
) VALUES
  (
    'okky',
    'OKKY 게시글·댓글',
    false,
    'robots 200·1733B 실측: /articles/<번호> 허용, /api/ 금지, /users/*/articles 금지 — 목록을 API 로 받을 수 없어 sitemap.xml 을 쓴다. 약관 평문 6964자에 크롤·로봇·스크래핑·마이닝·AI 조항 0건(라이선스 조항은 "외부 사이트에서의 검색, 수집 및 링크 허용"). 어댑터는 /articles/<번호> 만 받는다 — robots 가 여는 /questions/* 는 미실측이라 제외. 댓글 comment[] 는 중첩이고 commentCount 는 대댓글 포함 총합이라 평탄화 대조가 필수(실측 15건 중 13건 정확 일치, 1건은 삭제 댓글이 카운터에만 남아 부족분 1 허용). Actions 러너(Azure egress) 에서는 미측정. 사람이 켤 때까지 꺼둠',
    'ok',
    4000,
    100
  ),
  (
    'velog',
    '벨로그 글 본문',
    false,
    '본문 전용 — 댓글은 수집하지 않는다. 최상위 댓글은 __APOLLO_STATE__ 의 Comment:<uuid> 로 정적으로 오지만 대댓글(level>0)은 GraphQL POST 에만 있고 그건 러너 GET 계약 밖이다. 게다가 comments_count 가 최상위+대댓글과 화해되지 않는다(실측 3건 중 1건 어긋남: 11 vs 6+4) — 어느 쪽으로 세도 못 읽은 수를 신뢰할 수 없어 마커로 쓸 수 없다. 댓글 0건은 고장이 아니다. 채택 근거는 robots 가 아니다: robots 는 200·57B 에 User-agent:* 한 줄뿐 규칙 0개이고, 그건 금지하지 않았다는 뜻일 뿐 초대가 아니다 — 근거는 약관 전문 4193자(제1~12조+부칙)에 크롤·로봇·자동화·스크래핑·마이닝·수집·복제 조항 0건이라는 실측이다. released_at 은 UTC ISO 라 KST 변환 필수(실측 3건 중 2건이 하루 어긋난다). Actions 러너(Azure egress) 에서는 미측정. 사람이 켤 때까지 꺼둠',
    'ok',
    4000,
    100
  )
ON CONFLICT (key) DO NOTHING;

-- ⚠️ COMMENT ON COLUMN 은 **덮어쓰기다.** 20260919000001 의 전체 문구를 그대로
--    옮기고 okky·velog 만 덧붙였다. 한 줄만 쓰면 기존 SSRF 경고와
--    exhausted·SP-026·027·028 안내가 통째로 사라진다.
COMMENT ON COLUMN public.review_targets.product_ref IS
  '소스 안에서 수집 대상을 가리키는 값. danawa=pcode / appstore=<국가>:<앱ID> / hackernews=q:<키워드> / '
  'damoang·82cook·theqoo·todayhumor·brunch·clien·fmkorea·okky·velog=url:<글 경로>. '
  '어느 값을 붙일지는 사람이 정한다 — 시스템이 키워드로 상품을 검색해 후보 중 하나를 자동 선택하지 않는다. '
  'hackernews 의 q: 는 상품 식별자가 아니라 질의 자체이며, 한 질의에 여러 스레드가 걸리는 것이 정상 동작이다. '
  '커뮤니티 소스의 url: 은 **경로만** 담는다(호스트는 어댑터 상수). 호스트를 넣게 하면 SSRF 가 되므로 '
  'lib/review/adapters/url-ref.ts 가 ''..'' ''//'' ''@'' 와 공백을 거부한다. '
  'brunch·velog 만 예외로 그 공용 함수를 못 쓴다 — 글 경로가 /@핸들/… 라 ''@'' 에 걸린다. 대신 각 어댑터가 '
  '경로 전체를 화이트리스트 정규식으로 더 좁게 검증한다(공용 함수를 완화하지 않는다). velog 는 슬러그에 '
  '한글이 들어가므로 퍼센트 인코딩된 형태로 저장되고, 디코딩 후에도 세그먼트가 둘인지 다시 확인한다. '
  '이 소스들은 1글=1요청이라 수집 후 타깃이 status=exhausted 로 닫힌다 — 나중에 달린 댓글을 받으려면 '
  '사람이 status=''active'' 로 되돌려야 한다(자동 재활성화 없음). '
  'theqoo·todayhumor·brunch·velog 는 **본문 1건만** 적재된다 — 앞 둘은 댓글이 AJAX 라서, brunch 는 댓글 API 가 '
  'robots 금지(/api/)라서, velog 는 대댓글이 GraphQL POST 에만 있고 comments_count 가 화해되지 않아서다. '
  '댓글 0건은 고장이 아니다. '
  'todayhumor 의 경로는 쿼리형이다(/board/view.php?table=..&no=..). 이 사이트에 robots.txt 가 생기고 '
  '거기 쿼리 규칙이 들어가면 러너가 그 규칙을 못 본다(pathname 만 판정 — SP-026). '
  'clien 은 반대로 robots 에 ''Disallow: /*?*'' 가 있어 쿼리형 ref 를 어댑터가 거부한다. 그 robots 를 '
  '우리 UA 로는 못 읽으므로(404, SP-027) 어댑터의 가드가 유일한 방어선이다 — 넓히지 마라. '
  'fmkorea 는 robots 가 /best·/best2·/humor 만 열어 그 밖의 경로를 어댑터가 거부하며(SP-028), '
  '댓글이 많은 글은 마지막 댓글 페이지만 수집된다(알려진 한계 — 차액을 파싱 실패로 세지 않는다). '
  'okky 는 robots 가 /articles 와 /questions 를 모두 열지만 어댑터가 /articles/<번호> 만 받는다 '
  '(/questions 는 미실측 — 넓히려면 그 경로의 JSON-LD 를 먼저 떠라). /api/ 가 robots 금지라 '
  '글 목록은 sitemap.xml 에서 얻는다.';

-- 확인용 (실행 후 눈으로 볼 것):
--   select key, enabled, health, min_interval_ms, daily_request_cap
--   from public.review_sources order by key;
--
-- 기대: 15행(기존 13 + okky + velog),
--       okky·velog 가 enabled=false · health='ok' · 4000 · 100.
