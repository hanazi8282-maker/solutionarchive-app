-- todayhumor 댓글 수집 반영 — 표시명과 운영 주석 정정
-- 어댑터: lib/review/adapters/todayhumor.ts (2026-09-17)
--
-- ⚠️ **적용하지 않았다.** 사람이 적용한다(CLAUDE.md §10.1).
--    선행: 20260918000001(theqoo·todayhumor 등록) · 20260919000001(round-3).
--    그 둘도 미적용이면 순서대로 적용하면 된다 — 이 파일은 그 위를 덮는다.
--
-- 왜 필요한가: 20260919000001 이 심어 둔 운영 주석이 "theqoo·todayhumor 는
-- 본문 1건만 적재된다 / 댓글 0건은 고장이 아니다" 라고 말한다. todayhumor 에
-- 대해선 이제 **거짓**이고, 하필 이 소스의 가장 위험한 고장(별칭을 잘못 넣어
-- 댓글이 조용히 0건)을 "정상"이라고 안내하는 문구다(§7.1). 그대로 두면
-- 운영자가 초록불로 읽는다.
--
-- 요청량: 이 소스는 이제 1글=2요청이다. daily_request_cap 100 은 그대로
-- 두되(소스가 아직 enabled=false 다), 같은 상한이 사 주는 글 수는 절반이다.
-- 켤 때 상한을 다시 보라.

UPDATE public.review_sources
   SET display_name = '오늘의유머 게시글·댓글'
 WHERE key = 'todayhumor';

-- ⚠️ COMMENT ON COLUMN 은 **덮어쓰기다.** 20260919000001 의 전체 문구를 그대로
--    옮기고 todayhumor 부분만 고쳤다. 한 줄만 쓰면 나머지 안내가 통째로 사라진다.
COMMENT ON COLUMN public.review_targets.product_ref IS
  '소스 안에서 수집 대상을 가리키는 값. danawa=pcode / appstore=<국가>:<앱ID> / hackernews=q:<키워드> / '
  'damoang·82cook·theqoo·todayhumor·brunch·clien·fmkorea=url:<글 경로>. '
  '어느 값을 붙일지는 사람이 정한다 — 시스템이 키워드로 상품을 검색해 후보 중 하나를 자동 선택하지 않는다. '
  'hackernews 의 q: 는 상품 식별자가 아니라 질의 자체이며, 한 질의에 여러 스레드가 걸리는 것이 정상 동작이다. '
  '커뮤니티 7종의 url: 은 **경로만** 담는다(호스트는 어댑터 상수). 호스트를 넣게 하면 SSRF 가 되므로 '
  'lib/review/adapters/url-ref.ts 가 ''..'' ''//'' ''@'' 와 공백을 거부한다. '
  'brunch 만 예외로 그 공용 함수를 못 쓴다 — 글 경로가 /@핸들/번호 라 ''@'' 에 걸린다. 대신 brunch.ts 가 '
  '경로 전체를 ^/@<핸들>/<숫자>$ 화이트리스트로 더 좁게 검증한다(공용 함수를 완화하지 않는다). '
  'todayhumor 를 뺀 여섯 소스는 1글=1요청이라 수집 후 타깃이 status=exhausted 로 닫힌다 — 나중에 달린 '
  '댓글을 받으려면 사람이 status=''active'' 로 되돌려야 한다(자동 재활성화 없음). '
  'todayhumor 는 1글=**2요청**이다(본문 HTML → 댓글 JSON). 중간 커서가 memo:<parent_table>:<parent_id>:<댓글수> '
  '형태로 review_targets.cursor 에 잠깐 남는다 — 이 값이 보이면 2차 요청 대기 중이지 고장이 아니다. '
  '🔴 베스트/베오베 글은 URL 의 table·no 가 **가짜 별칭**이라(예: bestofbest/483825 → 실제 sisa/1271155) '
  '원본 부모키로 불러야 한다. 별칭으로 부르면 에러 없이 memos:[] 가 온다 — 그래서 어댑터가 본문의 '
  '개수 마커와 대조해 차액을 파싱 실패로 센다. todayhumor 의 댓글 0건은 **확인된 0 일 때만** 정상이다. '
  'theqoo·brunch 는 여전히 **본문 1건만** 적재된다 — theqoo 는 댓글 API 가 POST+세션쿠키를 요구해 '
  '러너의 요청 계약(GET url 만)으로 표현할 수 없고, brunch 는 댓글 API 가 robots 금지(/api/)다. '
  '이 둘의 댓글 0건은 고장이 아니다. '
  'todayhumor 의 경로는 쿼리형이다(/board/view.php?table=..&no=.. 와 /board/ajax_memo_list.php?..). '
  '이 사이트에 robots.txt 가 생기고 거기 쿼리 규칙이 들어가면 러너가 그 규칙을 못 본다(pathname 만 판정 — SP-026). '
  'clien 은 반대로 robots 에 ''Disallow: /*?*'' 가 있어 쿼리형 ref 를 어댑터가 거부한다. 그 robots 를 '
  '우리 UA 로는 못 읽으므로(404, SP-027) 어댑터의 가드가 유일한 방어선이다 — 넓히지 마라. '
  'fmkorea 는 robots 가 /best·/best2·/humor 만 열어 그 밖의 경로를 어댑터가 거부하며(SP-028), '
  '댓글이 많은 글은 마지막 댓글 페이지만 수집된다(알려진 한계 — 차액을 파싱 실패로 세지 않는다).';

-- 확인용 (실행 후 눈으로 볼 것):
--   select key, display_name, enabled, min_interval_ms, daily_request_cap
--   from public.review_sources where key = 'todayhumor';
--
-- 기대: display_name = '오늘의유머 게시글·댓글', enabled=false, 3000, 100.
