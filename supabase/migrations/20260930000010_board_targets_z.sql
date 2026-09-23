-- ============================================================
-- 게시판 순회 타깃 등록 (Z 몫) — velog 태그 `생산성`
--
-- ⛔ **이 파일은 아직 적용되지 않았다(미적용). 서브에이전트는 적용하지 않는다**
--    (CLAUDE.md §10.2 — 판단 주체가 아니다. 파일만 만들고 "미적용"을 보고한다).
--    적용은 사람 또는 대화형/역할 세션이 아래 "적용 전 조건" 을 확인한 뒤에 한다.
--
-- 🟢 비파괴. DDL 0줄. `analysis_projects` 1행 + `review_targets` 1행 INSERT 뿐이고
--    기존 행을 UPDATE·DELETE 하지 않는다. 롤백 파일이 그 2행만 지운다
--    (20260930000010_board_targets_z_rollback.sql).
--
-- ── ⛔ 적용 전 조건: **`review_sources` 의 velog 행이 존재해야 한다** ────
--
--   `review_targets.source_key` 가 거기로 FK 를 건다. 그 행은
--   `20260922000001_review_sources_okky_velog.sql` 이 넣는데 **그 파일도
--   미적용일 수 있다.** 먼저 확인한다:
--     SELECT key, enabled, min_interval_ms, daily_request_cap
--       FROM public.review_sources WHERE key = 'velog';
--   ⚠️ 없으면 이 파일이 FK 위반으로 실패한다(조용히 넘어가지 않는다 — 좋다).
--   ⚠️ velog 행은 `enabled = false` 로 들어간다. 그건 그대로 둔다 —
--      켜는 것은 별개 판단이고, 첫날은 dry-run 으로 응답 코드를 눈으로 본다.
--
--   (러너 쪽 선행 조건은 **해소됐다.** 초판은 `nextRequest(target, page)` 와
--    `if (!req)` 분기의 `endStatus` 두 건을 조건으로 적어 뒀는데, 공용 게시판
--    규약 PR(#246)이 `ParseResult.pauseRun` · `ParseContext.lastReviewAt` ·
--    "연속 0건 3회 안전장치" 로 그 문제를 다르게 풀었다. 어댑터는 그 규약에
--    맞춰져 있고 `scripts/review-board-z-selftest.mjs` 가 실행 간 커서 인수를
--    실제로 돌려 확인한다.)
--
-- ── 왜 이 소스·이 태그인가 ────────────────────────────────────────
--
-- 채택 근거는 **robots 가 아니라 이용약관**이다. 이 구분을 지우지 마라.
--   robots.txt 는 200 이지만 57바이트에 `User-agent: *` 한 줄뿐이고 규칙이 0개다.
--   리포 파서 판정은 `allowed` 이지만 사유가 "적용 그룹에 규칙이 0개 — 금지하지
--   않았을 뿐 초대는 아니다"다(lib/review/robots.ts).
--   실제 근거: `velog.io/policy/terms` **2026-09-24 재확인(요청 1회)** — HTTP 200,
--   평문 4,193자로 2026-09-18 측정과 **동일**, 제1조~제12조 + 부칙(2018.8.25).
--   금지어 스캔 재실행: 크롤 / 로봇 / robot / crawl / 자동 / 스크래핑 / 스크랩 /
--   마이닝 / 수집 / 복제 / 기계 / 봇 / API / 무단 **전부 0건**. 준거법 대한민국법.
--   ⇒ 게시판 순회를 새로 붙이는 데도 약관상 명시 금지는 없다. 그래도 "없음"을
--     "허가"로 읽지 않으므로 목록 요청을 실행당 1회·간격 5초 이상으로 묶는다.
--
-- 태그 `생산성`(`board:productivity`) — 2026-09-24 실측
-- (`GET /tags/생산성`, 목록 1페이지 = 글 10건). 10건 중 8건이 SaaS·AI 도구 사용
-- 후기였다. 제목 원문:
--   · Jev에게 내 Obsidian vault 정리를 맡겨봤다
--   · AI에게 같은 말을 매번 다시 하고 있다면 — md사용법
--   · 최고의 PPT를 만들어보자 with AI  (Gemini·Claude 등 4종 비교 후기)
--   · PDF 문서를 마크다운으로 바꿔서 노트로 관리하기
--   · [Claude Code] 내 세션이 점점 무거워진 이유 — /skill-doctor 와 128K 출력
--   · 바이브 코딩 그만두고 CLAUDE.md 다시 쓴 이유
--   · [바이브 코딩] Claude Code, Codex, Antigravity — 3대 코딩 에이전트 분업
--   · VS Code에서 DB 관리하기? Database Client 하나면 끝!
-- (나머지 2건은 노션 템플릿 공유·AI 활용론 — 도구 후기의 경계선이다.)
--
-- ⚠️ **태그는 1개만 등록한다.** 원래 "1~2개" 였지만 2번째 태그 후보를 **실측하지
--    못했다** — velog.io 요청 상한 3회를 약관 1 + 목록 1 + 글 1 로 다 썼다.
--    `board:trending` 도 같은 이유로 만들지 않았다(경로를 확인하지 못했다).
--    2번째를 늘리려면 그 태그 목록을 1회 받아 글 10건의 성격을 먼저 세라 —
--    "아마 비슷할 것"으로 늘리지 않는다(§7.1).
--
-- ── 비용·상한 ────────────────────────────────────────────────────
--
-- 실행당 요청 = 목록 1 + 새 글 N (N ≤ 19, 러너 MAX_PAGES_PER_TARGET 20).
-- 목록 1페이지가 10건이므로 실제로는 **하루 최대 11요청**이다.
-- velog 행의 `daily_request_cap`(100)·`min_interval_ms`(4000) 안에 들어간다.
-- ⚠️ 러너는 robots 의 Crawl-delay 와 DB 값 중 **큰 쪽**을 쓴다. velog robots 에는
--    Crawl-delay 선언이 없으므로 실효 간격은 DB 의 4초다. 위에서 "5초 이상"으로
--    묶겠다고 적었으니, 켜기 전에 velog 행을 5000 으로 올릴지 사람이 정한다:
--      UPDATE public.review_sources SET min_interval_ms = 5000 WHERE key = 'velog';
--    (이 파일은 `review_sources` 를 건드리지 않는다 — §10.1 에서 그 테이블은
--     robots·ToS 판단이 들어가므로 사람 몫이다.)
--
-- ── project_id 를 어떻게 정했나 ───────────────────────────────────
--
-- `review_targets.project_id` 는 NOT NULL + `analysis_projects` FK 다. 그런데
-- 게시판 타깃은 **경쟁사 하나가 아니라 태그 피드**라 기존 프로젝트에 붙일 자리가
-- 없다. 그래서 이 피드 전용 프로젝트 1행을 같이 만든다.
-- ⛔ 기존 프로젝트를 골라 붙이지 않는다 — 어느 프로젝트에 무엇을 붙일지는 사람이
--    정한다(lib/review/target-ref.ts 머리말의 ⛔). 자동 선택은 조용히 틀린 대상의
--    VOC 를 모으고, 결과가 그럴듯해서 아무도 못 알아챈다.
-- ⚠️ `status='collecting'` 으로 둔다. 추출·채점은 별도 단계다.
--
-- ── 적용 후 확인 (눈으로 볼 것) ───────────────────────────────────
--
--   SELECT t.source_key, t.product_ref, t.label, t.status, t.cursor,
--          t.last_review_at, t.total_collected, p.competitor_url
--     FROM public.review_targets t
--     JOIN public.analysis_projects p ON p.id = t.project_id
--    WHERE t.source_key = 'velog' AND t.product_ref LIKE 'board:%';
--   -- 기대: 1행 · source_key='velog' · status='active' · cursor IS NULL ·
--   --       total_collected=0 · competitor_url='https://velog.io/tags/생산성'
--
--   -- 음성 검사: 게시판 ref 가 어댑터에 되읽히는지. (DB 가 아니라 코드로 본다)
--   --   node -e "import('./lib/review/adapters/velog.ts').then(m=>
--   --     console.log(m.boardList('board:productivity')))"
--   --   기대: '/tags/%EC%83%9D%EC%82%B0%EC%84%B1'  (boardList 가 목록 경로를 준다)
--   --   null 이면 그 타깃은 매일 밤 0요청으로 끝난다(아무 에러도 안 난다).
-- ============================================================

BEGIN;

-- 1. 이 태그 피드 전용 프로젝트. `competitor_url` 을 자연키로 써서 재실행에 안전하게 만든다.
INSERT INTO public.analysis_projects (competitor_url, product_elevator_pitch, purpose, seller_own_guess, status)
SELECT
  'https://velog.io/tags/생산성',
  '벨로그 `생산성` 태그 — SaaS·AI 개발 도구 사용 후기가 모이는 피드. 경쟁사 1곳이 아니라 '
  '"1인 개발자가 어떤 도구를 왜 버리고 갈아탔는지"가 쌓이는 자리다. 2026-09-24 실측 목록 10건 중 8건이 도구 후기.',
  'product_fit',
  NULL,
  'collecting'
WHERE NOT EXISTS (
  SELECT 1 FROM public.analysis_projects WHERE competitor_url = 'https://velog.io/tags/생산성'
);

-- 2. 게시판 타깃. cursor 는 NULL 로 시작한다 — 첫 실행이 목록부터 받는다.
--    ⚠️ product_ref 의 slug 은 **어댑터 BOARDS 표의 내부 이름**이다(태그 원문이 아니다).
--       표에 없는 값을 넣으면 boardList 가 null 을 내고 그 타깃은 0요청으로 끝난다.
INSERT INTO public.review_targets (project_id, source_key, product_ref, label, cursor, status)
SELECT
  p.id,
  'velog',
  'board:productivity',
  '벨로그 태그 순회 · 생산성',
  NULL,
  'active'
  FROM public.analysis_projects p
 WHERE p.competitor_url = 'https://velog.io/tags/생산성'
   AND NOT EXISTS (
     SELECT 1 FROM public.review_targets
      WHERE source_key = 'velog' AND product_ref = 'board:productivity'
   );

-- 3. product_ref 컬럼 주석에 `board:` 형식을 덧붙인다.
--    ⚠️ COMMENT ON COLUMN 은 **덮어쓰기다.** 한 세대 전(20260922000001)이 아니라
--       **바로 앞 20260930000009(Y)의 전체 문구**를 옮기고 Z 단락을 덧붙였다. 한 세대를
--       건너뛰면 Y 가 적어 둔 board:<slug> 규약과 tumblbug 금지 문단이 통째로 사라진다.
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
  '글 목록은 sitemap.xml 에서 얻는다. '
  '⚠️ 2026-09-24 추가 — 게시판 모드 ''board:<slug>''. 타깃 1개가 목록 1요청 + 글 최대 19요청으로 '
  '목록→글→댓글을 스스로 순회한다. 커서에 "안 읽은 글 큐 + 마지막 글 id" JSON 이 들어간다 — '
  '사람이 손으로 고치지 마라(읽을 수 없는 값이면 어댑터가 목록부터 다시 시작한다). '
  '현재 okky=''board:community'' 하나뿐이고, okky 의 목록 경로는 /community 다 '
  '(위 문단의 "sitemap.xml 을 쓴다"는 url: 모드 이야기다 — /articles 는 404 이고 /community 는 '
  '정적 HTML 에 글 20건이 다 온다는 것을 2026-09-24 에 실측했다). '
  '⛔ tumblbug 의 ''board:discover:<category>'' 는 등록하지 않는다 — Allow 된 /discover?category= 가 '
  'CSR 껍데기라(projectStore.projects=[]) 목록을 못 읽는다. 그건 0건이 아니라 파싱 실패다. '
  '⚠️ 2026-09-24 추가(Z) — velog 도 게시판 모드를 쓴다: ''board:productivity''(태그 생산성). '
  'slug 은 태그 원문이 아니라 어댑터 BOARDS 표의 내부 이름이다 — 공용 parseBoardRef 가 slug 을 '
  '[A-Za-z0-9_-] 로 묶는데 velog 태그는 한글이라서다. 표에 없는 slug 을 넣으면 그 타깃은 매일 밤 '
  '0요청으로 끝난다(아무 에러도 안 난다). 목록은 /tags/<인코딩된 태그> 1페이지만 받는다 — 다음 장은 '
  '무한 스크롤의 GraphQL POST 이고 그건 러너의 GET 계약 밖이다. '
  '⚠️ velog 커서의 last 에는 글 id 가 아니라 released_at 원본 ISO 가 들어간다. velog 의 글 id 는 '
  'uuid 라 순서가 없어 compareBoardId 로 비교하면 증분이 조용히 틀린다 — 같은 형식의 UTC ISO 는 '
  '문자열 비교가 곧 시각 비교이므로 그 자리에 시각을 넣어 문자열 폴백을 의도적으로 쓴다. '
  '⚠️ velog 는 2026-09-24 부터 **본문 + 최상위 댓글**을 받는다(위 문단의 "본문 1건만" 목록에서 빠졌다). '
  '개수 마커는 comments_count 가 아니라 Post.comments 의 참조 배열 길이다 — 전자는 대댓글·삭제분을 '
  '섞어 화해되지 않고(실측 11 ≠ 6+4), 후자는 정확히 화해된다(참조 6 → 해소 6). 대댓글(level>0)은 '
  'GraphQL POST 에만 있어 오지 않는다. 그 0건은 고장이 아니다. '
  'velog 글 슬러그 상한은 인코딩 600자다 — 한글 1자가 인코딩 9자라 300 이던 시절 실제 글이 탈락했다(실측 344자). '
  '⛔ damoang 에는 게시판 모드를 만들지 않았다 — 목록(/free·/feed)이 Cloudflare 인터랙티브 챌린지 '
  '403 이다(글 페이지는 200, 2026-09-24 실측). **robots 는 목록을 허용한다** — 막은 것은 서버다. '
  '그래서 damoang 의 url: 도 2026-09-24 에 <게시판>/<글번호> 두 세그먼트로 좁혔다: url:/free 같은 '
  '목록 ref 를 등록하면 403 이 오고, 러너가 그것을 차단으로 분류해 그 실행의 damoang 소스 전체를 '
  '중단한다 — 잘 돌던 글 타깃까지 같이 죽는다.';

COMMIT;
