-- ============================================================
-- 게시판 모드 타깃 등록 (Y 몫: okky · tumblbug)
-- 어댑터: lib/review/adapters/okky.ts · tumblbug.ts
-- 검증:   scripts/review-board-y-selftest.mjs (실측 픽스처 · 네트워크 없음)
--
-- 🟢 비파괴. DDL 없음, 백필 없음, 기존 행 UPDATE 없음.
--    새 review_targets 행 1개 + 컬럼 주석 1개 갱신뿐이다.
--    롤백: 20260930000009_board_targets_y_rollback.sql (그 행만 DELETE).
--
-- ⛔ **미적용.** 서브에이전트는 어떤 경우에도 적용하지 않는다(CLAUDE.md §10.2).
--    사람 또는 대화형/역할 세션이 적용한다.
--
-- ⚠️ 선행 조건 2개. 없으면 이 파일은 아무 효과가 없다(또는 FK 로 실패한다).
--    1) review_sources 에 'okky' 행이 있어야 한다(20260922000001).
--       그 행이 `enabled=false` 면 러너가 소스를 통째로 건너뛴다 — 타깃만 넣어도 0건이다.
--    2) 아래 v_project 를 사람이 채워야 한다(맨 아래 ⚠️ 참조).
--
-- ─────────────────────────────────────────────────────────────────
-- 게시판 모드가 무엇인가
--
-- `product_ref = 'board:<slug>'` 인 타깃 1개가 **목록 1회 → 새 글 → 댓글**까지
-- 스스로 순회한다. 기존 `url:<글 경로>` 는 사람이 글 주소를 하나씩 등록해야 했고
-- 그게 VOC 수집의 병목이었다(reports/2026-09-23/voc-expansion-investigation.md).
--
-- 한 실행 비용: 목록 1요청 + 글 최대 19요청 = 20 (러너의 MAX_PAGES_PER_TARGET).
-- okky 의 daily_request_cap 은 100 이라 이 타깃 1개로는 20% 를 쓴다. 보드를 더
-- 열 때 이 한도를 먼저 계산해라 — 상한에 걸리면 뒤 타깃이 조용히 0건이 된다.
--
-- ─────────────────────────────────────────────────────────────────
-- ✅ okky `board:community` — 등록한다
--
-- 왜 이 목록인가: OKKY 는 개발자 커뮤니티이고, `/community` 가 개발 도구·SaaS·
-- 업무 환경 불만이 모이는 일반 게시판이다(실측 20건의 제목에 Cloudflare 호스팅
-- 장애, AI 펌웨어, 이직·퇴사 같은 소재가 섞여 있었다). 상세 페이지가
-- `/articles/<번호>` 라 **이미 실측·구현된 파서를 그대로 쓴다**(JSON-LD
-- DiscussionForumPosting: 본문 + 댓글 전문 + 작성일 + commentCount 마커).
--
-- robots (2026-09-24 · 200 · 1,733B · 원문은 fixtures/review/okky/robots.txt,
-- 판정은 문서가 아니라 리포 파서로 냈다):
--     ALLOW /community          (일치하는 규칙 없음)
--     ALLOW /articles/1564558   (일치하는 규칙 없음)
--     DENY  /api/v1/articles/1  · /users/1/articles · /login · /changes
--   `*` 그룹에 Crawl-delay 선언이 없다(bingbot 만 1초) → 간격은 아래 소스 설정이
--   정한다. review_sources.okky.min_interval_ms = 4000 (요청한 3초보다 넉넉하다).
--
-- 약관 재확인 (2026-09-24 · https://okky.kr/legal/terms · 평문 6,968자):
--   크롤·로봇·스크래·마이닝 **0건**, 라이선스 조항에 "외부 사이트에서의 검색,
--   수집 및 링크 허용" 1건 그대로. → 새로운 법적 리스크가 아니다(§10.2 예외 아님).
--
-- ⚠️ **`/questions` 는 등록하지 않았다.** robots 는 열어 두지만 목록이 SSR 인지,
--    상세(`/questions/<번호>`)의 JSON-LD 가 `/articles` 와 같은 구조인지 **실측하지
--    않았다**(호스트당 요청 예산 소진). 규칙만 넓히고 파서를 안 보면 조용히 0건이
--    된다 — 어댑터의 BOARDS 맵도 `community` 만 안다. 열려면 그 두 페이지를 먼저 떠라.
--
-- ⚠️ **같은 글을 덮는 `url:` okky 타깃이 있으면 두 행으로 적재된다.**
--    identity_key = sha256(sourceKey|product_ref|external_id) 라서 product_ref 가
--    다르면 다른 리뷰로 들어간다(lib/review/fingerprint.ts, SP-031 과 같은 형태).
--    코드가 막지 못한다. 적용 전에 아래로 확인하고, 겹치면 사람이 정리한다:
--      SELECT id, product_ref, status FROM public.review_targets
--       WHERE source_key='okky' AND product_ref LIKE 'url:/articles/%';
--
-- ─────────────────────────────────────────────────────────────────
-- ⛔ tumblbug `board:discover:<category>` — 등록하지 않는다 (2026-09-24 실측)
--
-- robots 가 `Allow: /discover?category=` 로 딱 한 경로를 열어 둔다(원문:
-- fixtures/review/tumblbug/robots.txt). 그 경로를 실제로 받아 봤다:
--     GET /discover?category=technology  → 200 · 59,697B
--     렌더 텍스트 690자 · 프로젝트 링크 **0개** · MOBX_STATE.projectStore.projects = **[]**
-- 목록은 창작자 설명·코멘트와 같은 자리에 있다 — `/api/` XHR 이고 robots 금지다.
-- 남은 정적 목록은 사이트맵 하나인데 카테고리로 갈리지 않으므로 "게시판"이 아니다.
--
-- ⚠️ **이건 "후기가 없다"가 아니라 "목록을 못 읽었다"다**(CLAUDE.md §7.1). 그래서
--    어댑터는 빈 목록을 0건이 아니라 **파싱 실패 1건**으로 낸다. 지금 타깃을 넣으면
--    매일 실패 1건을 찍으며 도는 타깃이 되고, 그게 쌓이면 소스 건강도가 broken 으로
--    떨어져 **`url:` 로 잘 돌던 텀블벅 프로젝트 타깃까지 함께 꺼진다.**
--
-- 그래서 아래는 주석으로만 둔다. 텀블벅이 목록을 SSR 로 바꾸면
-- scripts/review-board-y-selftest.mjs 의 "실측 projectStore.projects 는 빈 배열"
-- 단정이 먼저 깨진다 — 그때 이 두 줄의 주석을 풀어라(테크·생활 2개).
--
--   ('board:discover:technology', '텀블벅 테크·가전 카테고리'),
--   ('board:discover:living',     '텀블벅 홈·리빙 카테고리'),
--
--   ⚠️ 그때도 카테고리 slug 를 **실측으로** 확인해라. 위 두 slug 는 URL 로
--      확인한 것이 `technology` 하나뿐이고 `living` 은 추측이다.
-- ============================================================

BEGIN;

DO $$
DECLARE
  -- ⚠️ **적용하는 사람이 이 한 줄을 채운다.**
  --    게시판 타깃은 상품 1개가 아니라 "개발자 커뮤니티 VOC" 를 모으는 것이므로
  --    어느 분석 프로젝트에 달지는 사람이 정한다. 자동으로 고르지 않는다 —
  --    lib/review/target-ref.ts 의 ⛔(자유 텍스트로 검색해 후보를 자동 선택하지
  --    않는다)와 같은 이유다. 조용히 틀린 프로젝트에 붙으면 분석 결과가
  --    그럴듯해서 아무도 못 알아챈다.
  --
  --    후보 보기:
  --      SELECT id, product_elevator_pitch, purpose, status, created_at
  --        FROM public.analysis_projects ORDER BY created_at DESC LIMIT 20;
  v_project uuid := NULL;  -- ← 예: '11111111-2222-3333-4444-555555555555'::uuid
  v_inserted integer;
BEGIN
  IF v_project IS NULL THEN
    RAISE EXCEPTION 'v_project 가 비어 있다. 이 타깃을 붙일 analysis_projects.id 를 사람이 채워라 (파일 상단 주석 참조).';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.analysis_projects WHERE id = v_project) THEN
    RAISE EXCEPTION 'analysis_projects 에 % 가 없다.', v_project;
  END IF;

  -- 소스 행이 없으면 FK 로 실패하는데, 그 에러는 원인을 알려 주지 않는다.
  IF NOT EXISTS (SELECT 1 FROM public.review_sources WHERE key = 'okky') THEN
    RAISE EXCEPTION 'review_sources 에 okky 행이 없다. 20260922000001 을 먼저 적용해라.';
  END IF;

  INSERT INTO public.review_targets (project_id, source_key, product_ref, label, status)
  VALUES (
    v_project,
    'okky',
    'board:community',
    'OKKY 커뮤니티 게시판 순회(목록→글→댓글)',
    'active'
  )
  ON CONFLICT (project_id, source_key, product_ref) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- ⚠️ 0 은 실패가 아니라 "이미 있다"다. 둘을 구분해 남긴다(§7.1) — 조용히
  --    통과시키면 "등록했다"고 믿은 채 타깃이 없는 상태가 유지된다.
  IF v_inserted = 0 THEN
    RAISE NOTICE 'board:community 타깃이 이미 있다(새로 넣지 않았다). 아래 확인 쿼리로 status 를 눈으로 봐라.';
  ELSE
    RAISE NOTICE 'board:community 타깃 1건 등록.';
  END IF;

  -- ⚠️ 소스가 꺼져 있으면 타깃이 있어도 0건이다. 켜는 것은 **이 파일이 하지 않는다** —
  --    사람이 판단해 따로 실행한다: update public.review_sources set enabled=true where key='okky';
  IF NOT EXISTS (SELECT 1 FROM public.review_sources WHERE key = 'okky' AND enabled) THEN
    RAISE NOTICE 'review_sources.okky 가 enabled=false 다. 이 상태로는 러너가 소스를 건너뛴다(타깃은 등록됨).';
  END IF;
END $$;

-- ⚠️ COMMENT ON COLUMN 은 **덮어쓰기다.** 20260922000001 의 전체 문구를 그대로
--    옮기고 게시판 모드 문단만 덧붙였다. 한 줄만 쓰면 기존 SSRF 경고와
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
  '글 목록은 sitemap.xml 에서 얻는다. '
  '⚠️ 2026-09-24 추가 — 게시판 모드 ''board:<slug>''. 타깃 1개가 목록 1요청 + 글 최대 19요청으로 '
  '목록→글→댓글을 스스로 순회한다. 커서에 "안 읽은 글 큐 + 마지막 글 id" JSON 이 들어간다 — '
  '사람이 손으로 고치지 마라(읽을 수 없는 값이면 어댑터가 목록부터 다시 시작한다). '
  '현재 okky=''board:community'' 하나뿐이고, okky 의 목록 경로는 /community 다 '
  '(위 문단의 "sitemap.xml 을 쓴다"는 url: 모드 이야기다 — /articles 는 404 이고 /community 는 '
  '정적 HTML 에 글 20건이 다 온다는 것을 2026-09-24 에 실측했다). '
  '⛔ tumblbug 의 ''board:discover:<category>'' 는 등록하지 않는다 — Allow 된 /discover?category= 가 '
  'CSR 껍데기라(projectStore.projects=[]) 목록을 못 읽는다. 그건 0건이 아니라 파싱 실패다.';

COMMIT;

-- 확인용 (실행 후 눈으로 볼 것):
--   SELECT t.id, t.product_ref, t.label, t.status, t.cursor, t.last_run_at, t.total_collected,
--          s.enabled, s.min_interval_ms, s.daily_request_cap
--     FROM public.review_targets t
--     JOIN public.review_sources s ON s.key = t.source_key
--    WHERE t.source_key = 'okky' ORDER BY t.product_ref;
--
-- 기대: 'board:community' 행 1개 · status='active' · cursor IS NULL(아직 안 돎).
--
-- ⚠️ 첫 실행 뒤에 이걸 다시 봐라. 안전장치가 걸린 것을 정상으로 읽지 않기 위해서다(§7.2):
--   · cursor 가 NULL 이고 status='active'  → 큐를 다 비웠다(정상. incrementalOnly).
--   · cursor 에 JSON 이 남아 있고 active   → 페이지 상한 20 에 걸려 잘렸다. 다음 실행이 이어 읽는다.
--   · status='exhausted'                   → **이상이다.** 게시판 타깃은 닫히지 않아야 한다.
--                                            nextRequest 가 null 을 냈다는 뜻이다(어댑터 주석 참조).
--   · total_collected 가 0 인데 실행됐다    → 목록을 못 읽었을 수 있다. review_sources.health 와
--                                            그날 로그의 파싱 실패 수를 함께 봐라.
