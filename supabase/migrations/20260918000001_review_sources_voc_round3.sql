-- VOC 소스 라운드3 — bobaedream 1종 등록
-- 어댑터: lib/review/adapters/bobaedream.ts
-- 실측: docs/review-source-findings.md
--       "VOC 소스 3종 실측 — tumblbug · naver_blog · bobaedream (2026-09-17)"
--
-- 🟢 비파괴. DDL 없음, 백필 없음. 새 행 1개 + 컬럼 주석 갱신뿐이고
--    기존 10행(danawa/appstore/hackernews/damoang/82cook 등)은 건드리지 않는다.
--
-- ⛔ Claude 가 실행하지 않는다. 사람이 적용한다(CLAUDE.md §10.1).
--    supabase db query --linked -f 또는 대시보드.
--
-- ─────────────────────────────────────────────────────────────────
-- 왜 1종인가 — 3종을 설계했고 2종이 실측에서 떨어졌다
--
-- tumblbug: 후원자 코멘트가 정적 HTML 에 **0건**이다. hydration JSON
--   (window.MOBX_STATE)에 comment 스토어 자체가 없고 XHR 로만 온다.
--   그 XHR 은 robots 가 금지한 `/api/` 다. 대체로 쓰려던 프로젝트 설명도
--   `projectStore.project.story === null` 이라 정적으로 오지 않는다.
--   설계상 탈락 조건("코멘트가 /api/ 로만 오면 설명만, 그것도 없으면 제외")에
--   그대로 걸렸다. 어댑터·픽스처·행 전부 만들지 않았다.
--
-- naver_blog_post: 파싱은 가능했다(본문 컨테이너·발행일 마커 실측 확인).
--   막은 것은 기술이 아니라 **약관**이다. 네이버 서비스 이용약관
--   (2025-07-10 시행)이 "네이버의 사전 허락 없이 자동화된 수단(예: 매크로
--   프로그램, 로봇(봇), 스파이더, 스크래퍼 등)을 이용하여 … 네이버 서비스에
--   게재된 회원의 아이디(ID), 게시물 등을 수집하거나 … 해서는 안 됩니다"
--   라고 우리 행위를 직접 지목해 금지한다. robots.txt 본문에도
--   "BOT ACCESS FOR THE PURPOSES OF AI TRAINING AND RETRIEVAL-AUGMENTED
--   GENERATION (RAG) IS STRICTLY PROHIBITED" 가 적혀 있고 ClaudeBot ·
--   Claude-SearchBot 이 이름으로 전면 금지돼 있다.
--   SP-025(다모앙)는 "기계 판정은 allowed 이고 의사는 불명확" 이었지만
--   여기는 약관 본문이 명시적이다. 구현자가 넘을 선이 아니라고 보고
--   **어댑터를 만들지 않았다.** 진행하려면 사람이 결정해야 한다.
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
  )
ON CONFLICT (key) DO NOTHING;

COMMENT ON COLUMN public.review_targets.product_ref IS
  '소스 안에서 수집 대상을 가리키는 값. danawa=pcode / appstore=<국가>:<앱ID> / hackernews=q:<키워드> / '
  'damoang·82cook·bobaedream=url:<글 경로>. '
  '어느 값을 붙일지는 사람이 정한다 — 시스템이 키워드로 상품을 검색해 후보 중 하나를 자동 선택하지 않는다. '
  'hackernews 의 q: 는 상품 식별자가 아니라 질의 자체이며, 한 질의에 여러 스레드가 걸리는 것이 정상 동작이다. '
  'url: 은 **경로만** 담는다(호스트는 어댑터 상수). 호스트를 넣게 하면 SSRF 가 되므로 '
  'lib/review/adapters/url-ref.ts 가 ''..'' ''//'' ''@'' 와 공백을 거부한다. '
  'bobaedream 은 거기 더해 어댑터가 경로를 ''/view?code=<게시판>&No=<번호>'' 하나로 한정한다 — '
  '글이 아닌 페이지는 HTTP 200 인데 본문이 없어서(없는 게시판은 200/121바이트) 조용히 실패만 쌓인다. '
  '이 세 소스는 1글=1요청이라 수집 후 타깃이 status=exhausted 로 닫힌다 — 나중에 달린 댓글을 받으려면 '
  '사람이 status=''active'' 로 되돌려야 한다(자동 재활성화 없음).';

-- 확인용 (실행 후 눈으로 볼 것):
--   select key, enabled, health, min_interval_ms, daily_request_cap
--   from public.review_sources order by key;
--
-- 기대: 82cook / appstore / bobaedream / damoang / danawa / hackernews ... 순,
--       bobaedream 이 enabled=false · 3000 · 100.
