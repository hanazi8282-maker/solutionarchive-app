-- ============================================================
-- 20260930000009_board_targets_y — 롤백
--
-- 🟡 행 1개를 지운다. 지워지는 것과 남는 것을 갈라 적는다.
--
-- 사라진다:
--   · review_targets 의 'board:community' 행(okky) — 그 타깃의 cursor ·
--     last_review_at · total_collected 를 잃는다. 다시 넣으면 목록 첫 페이지부터
--     시작한다(그 타깃은 원래 매 실행 목록부터 읽으므로 실질 손실은 통계뿐이다).
--
-- 남는다:
--   · **이미 적재된 리뷰와 지문은 지우지 않는다.** analysis_inputs ·
--     review_fingerprints 는 그대로다. 그래서 타깃을 다시 넣어도 같은 글이
--     중복 적재되지 않는다(identity_key 가 잡는다).
--     ⚠️ 그 리뷰들을 정말 빼야 한다면 이 파일이 아니라 scripts/review-purge.mjs 를 써라.
--   · review_sources.okky 행(그건 20260922000001 소관이다).
--
-- product_ref 컬럼 주석은 20260922000001 판으로 되돌린다 — 게시판 모드 문단을 뺀다.
-- (주석은 덮어쓰기라 "일부만 지우기"가 없다. 전문을 다시 쓴다.)
-- ============================================================

BEGIN;

DELETE FROM public.review_targets
 WHERE source_key = 'okky'
   AND product_ref = 'board:community';

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

COMMIT;

-- 확인
-- SELECT count(*) FROM public.review_targets
--  WHERE source_key='okky' AND product_ref LIKE 'board:%';     -- 기대: 0
--
-- ⚠️ 코드는 그대로다. 어댑터가 board: 를 계속 읽을 수 있고 셀프테스트도 돈다 —
--    이 파일은 "그 타깃을 돌리지 않는다"만 되돌린다. 코드까지 되돌리려면 PR 을 revert 해라.
