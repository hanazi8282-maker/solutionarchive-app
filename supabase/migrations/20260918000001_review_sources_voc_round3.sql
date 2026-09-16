-- VOC 소스 라운드3 — bobaedream · tumblbug · naver_blog_post 3종 등록
-- 어댑터: lib/review/adapters/{bobaedream,tumblbug,naver-blog}.ts
-- 실측: docs/review-source-findings.md
--       "VOC 소스 3종 실측 — tumblbug · naver_blog · bobaedream (2026-09-17)"
--
-- 🟢 비파괴. DDL 없음, 백필 없음. 새 행 3개 + 컬럼 주석 갱신뿐이고
--    기존 10행(danawa/appstore/hackernews/damoang/82cook 등)은 건드리지 않는다.
--
-- ⛔ Claude 가 실행하지 않는다. 사람이 적용한다(CLAUDE.md §10.1).
--    supabase db query --linked -f 또는 대시보드.
--
-- ⛔ **3행 모두 enabled=false 다.** 셋 다 사람이 켜야 시작한다.
--    특히 naver_blog_post 는 약관 리스크를 인지하고 받은 소스다(SP-030).
--
-- ─────────────────────────────────────────────────────────────────
-- 남헌 2026-09-17 결정 — 리스크를 알고 진행한다 (SP-030 · SP-031)
--
-- AC-0 실측에서 tumblbug 과 naver_blog_post 는 한 번 "제외" 로 보고됐다.
-- 그 보고를 받고 사람이 **둘 다 진행**으로 결정했다. 무엇을 알고 결정했는지
-- 남겨 둔다 — 나중에 이 행을 켜는 사람이 같은 것을 알아야 한다.
--
-- naver_blog_post (SP-030) — **이 리포에서 법적 리스크가 가장 높은 소스다.**
--   네이버 서비스 이용약관(2025-07-10 시행)이 "네이버의 사전 허락 없이
--   자동화된 수단(예: 매크로 프로그램, 로봇(봇), 스파이더, 스크래퍼 등)을
--   이용하여 … 네이버 서비스에 게재된 회원의 아이디(ID), 게시물 등을
--   수집하거나 … 해서는 안 됩니다" 라고 우리 행위를 문장으로 직접 지목한다.
--   robots.txt 본문에도 "BOT ACCESS FOR THE PURPOSES OF AI TRAINING AND
--   RETRIEVAL-AUGMENTED GENERATION (RAG) IS STRICTLY PROHIBITED" 가 적혀
--   있고 ClaudeBot · Claude-SearchBot 이 이름으로 전면 금지돼 있다.
--   우리 UA 토큰은 목록에 없고 /PostView.naver 도 Disallow 에 없어 **기계
--   판정은 allowed** 지만 그걸 근거로 쓰지 않는다. SP-025(다모앙)는 robots 의
--   의사 표시였고 여기는 약관 본문이다 — **상위 리스크**다.
--   댓글은 받지 않는다(apis.naver.com cbox XHR). 본문 1건만 수집한다.
--
-- tumblbug (SP-031) — 이용약관의 "자동화된 수단으로 서비스 조작·이용" 금지
--   조항을 인지한 채로 진행 결정. 수집 대상은 설계가 바뀌었다: 후원자 코멘트와
--   프로젝트 설명이 정적 HTML 에 없어서(둘 다 robots 가 막은 /api/ XHR),
--   MOBX_STATE 의 **창작자 후기 프리뷰**를 받는다. 창작자당 최대 4건이다.
--   ⚠️ 그 프리뷰에는 같은 창작자의 **다른 프로젝트** 후기가 섞여 온다. 어댑터는
--   그중 **이 타깃 프로젝트의 후기만** 받는다(나머지는 filtered). 안 그러면
--   같은 후기가 타깃마다 새 행으로 적재된다 — identity_key 에 product_ref 가
--   들어가기 때문이다(lib/review/fingerprint.ts). 그래서 타깃 하나가 받는 건수는
--   4건보다 적을 수 있고(실측 /eastereggs 2건, /cairn 0건), 창작자의 4건을 다
--   받으려면 후기가 달린 프로젝트를 각각 타깃으로 등록해야 한다 — 겹쳐도 안전하다.
--
-- 켜는 명령(사람이 실행):
--   update public.review_sources set enabled = true where key = 'bobaedream';
--   update public.review_sources set enabled = true where key = 'tumblbug';
--   update public.review_sources set enabled = true where key = 'naver_blog_post';
--
-- ─────────────────────────────────────────────────────────────────
-- 보배드림 — 통과 근거 (실측 2026-09-17)
--
--   robots.txt   `User-agent: * / Allow: /` — 전면 허용. 금지 경로 0개
--   접근 안정성   정직한 UA 로 18회 요청 전부 HTTP 200. 403·301 재현 안 됨
--                (설계 단계에서 우려했던 오락가락은 관측되지 않았다)
--   댓글         정적 HTML. 실측 글의 댓글 23건이 1요청에 전부 도달
--   개수 마커     `<span class="comm2">(23)</span>` — 마커 23 = 앵커 23 일치
--   고유 id      `id="small_cmt_1018669"` — composite 폴백이 필요 없다
--
-- 그래도 **enabled=false 로 등록한다.** 사이트 이용약관 원문을 찾지 못했다
-- (푸터에 약관 링크가 없고 추정 경로 3개가 전부 404). robots 가 허용한다는
-- 것과 약관이 허용한다는 것은 다른 사실이고, 확인 못 한 것을 허용으로
-- 접지 않는다(CLAUDE.md §7.1). 킬스위치를 미리 걸어 둔 상태로 시작한다.
--
--   update public.review_sources set enabled = true where key = 'bobaedream';
-- ─────────────────────────────────────────────────────────────────
--
-- 간격·상한은 damoang·82cook 과 같은 값이다. 공식 API 가 아니라 커뮤니티
-- 사이트라는 조건이 같고, 완화할 근거가 없다.
--   min_interval_ms   3000
--   daily_request_cap 100   (1글=1요청이므로 하루 100글)

INSERT INTO public.review_sources (
  key, display_name, enabled, disabled_reason, health, min_interval_ms, daily_request_cap
) VALUES
  (
    'bobaedream',
    '보배드림 게시글·댓글',
    false,
    'robots 전면 허용 + 정직 UA 18/18 HTTP 200 + 셀렉터 실측 완료(2026-09-17). 사이트 이용약관 원문을 찾지 못해(푸터에 링크 없음) 확인 전까지 꺼둠',
    'ok',
    3000,
    100
  ),
  (
    'tumblbug',
    '텀블벅 창작자 후기',
    false,
    '셀렉터 실측 완료(2026-09-17). 후원자 코멘트·프로젝트 설명은 정적 HTML 에 없어 창작자 후기 프리뷰(창작자당 최대 4건)로 축을 바꿈. 이용약관 "자동화된 수단" 조항을 남헌이 인지 후 진행 승인 — SP-031 참조. 사람이 켤 때까지 꺼둠',
    'ok',
    3000,
    100
  ),
  (
    'naver_blog_post',
    '네이버 블로그 본문',
    false,
    '⚠️ 법적 리스크 최상. 네이버 이용약관이 자동화 수단의 게시물 수집을 명시 금지하고 robots 가 RAG 목적 봇 접근을 금지(ClaudeBot 전면 차단). 기계 판정은 allowed 지만 약관이 명시적이라 다모앙(SP-025)보다 상위 리스크 — 남헌이 2026-09-17 인지 후 진행 승인, SP-030 참조. 댓글 미수집(cbox 별도 호스트), 본문 1건만. 사람이 켤 때까지 꺼둠',
    'ok',
    3000,
    100
  )
ON CONFLICT (key) DO NOTHING;

COMMENT ON COLUMN public.review_targets.product_ref IS
  '소스 안에서 수집 대상을 가리키는 값. danawa=pcode / appstore=<국가>:<앱ID> / hackernews=q:<키워드> / '
  'damoang·82cook·bobaedream·tumblbug·naver_blog_post=url:<글 경로>. '
  '어느 값을 붙일지는 사람이 정한다 — 시스템이 키워드로 상품을 검색해 후보 중 하나를 자동 선택하지 않는다. '
  'hackernews 의 q: 는 상품 식별자가 아니라 질의 자체이며, 한 질의에 여러 스레드가 걸리는 것이 정상 동작이다. '
  'url: 은 **경로만** 담는다(호스트는 어댑터 상수). 호스트를 넣게 하면 SSRF 가 되므로 '
  'lib/review/adapters/url-ref.ts 가 ''..'' ''//'' ''@'' 와 공백을 거부한다. '
  'bobaedream 은 거기 더해 어댑터가 경로를 ''/view?code=<게시판>&No=<번호>'' 하나로 한정한다 — '
  '글이 아닌 페이지는 HTTP 200 인데 본문이 없어서(없는 게시판은 200/121바이트) 조용히 실패만 쌓인다. '
  'naver_blog_post 는 ''/PostView.naver?blogId=<id>&logNo=<번호>'' 로 한정한다 — '
  '예쁜 URL(blog.naver.com/<id>/<번호>)은 HTTP 200 에 2,817바이트짜리 빈 iframe 껍데기라서 '
  '허용하면 ''200인데 내용 0''을 수집하고, robots 가 막은 PostList/PostPrint/comment 경로도 함께 막힌다. '
  'tumblbug 는 프로젝트 경로 한 세그먼트(''/<slug>'')다. 정적으로 오는 것이 ''이 창작자의 지난 프로젝트 후기'' '
  '프리뷰(창작자당 최대 4건)뿐이라 한 페이지에 **다른 프로젝트 후기가 섞여 온다** — 어댑터가 '
  'product_ref 의 slug 와 projectPermalink 이 같은 것만 받는다. 섞인 채로 받으면 같은 후기가 '
  '타깃마다 새 행으로 적재된다(identity_key = sha256(source|product_ref|external_id) 라 '
  'product_ref 가 다르면 키가 다르다). 그래서 타깃 1개가 받는 건수는 4건보다 적을 수 있고 '
  '(실측 /eastereggs 2건, /cairn 0건 — 0건은 고장이 아니다), 창작자의 4건을 다 받으려면 '
  '후기가 달린 프로젝트를 각각 타깃으로 등록한다. 창작자가 겹쳐도 중복 적재되지 않는다. '
  '이 소스들은 1문서=1요청이라 수집 후 타깃이 status=exhausted 로 닫힌다 — 나중에 달린 댓글을 받으려면 '
  '사람이 status=''active'' 로 되돌려야 한다(자동 재활성화 없음).';

-- 확인용 (실행 후 눈으로 볼 것):
--   select key, enabled, health, min_interval_ms, daily_request_cap
--   from public.review_sources order by key;
--
-- 기대: 82cook / appstore / bobaedream / damoang / danawa / hackernews /
--       naver_blog_post / tumblbug ... 순,
--       새 3행이 전부 enabled=false · 3000 · 100.
