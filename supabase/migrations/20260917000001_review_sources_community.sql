-- 커뮤니티 VOC 소스 2종 등록 — damoang · 82cook
-- 어댑터: lib/review/adapters/damoang.ts · lib/review/adapters/82cook.ts
-- 실측: docs/review-source-findings.md "커뮤니티 소스 실측 (2026-09-16)"
--
-- 🟢 비파괴. DDL 없음, 백필 없음. 새 행 2개 + 컬럼 주석 갱신뿐이고
--    기존 8행(danawa/appstore/hackernews 등)은 건드리지 않는다.
--
-- ⛔ Claude 가 실행하지 않는다. 사람이 적용한다(CLAUDE.md §10.1).
--    supabase db query --linked -f 또는 대시보드.
--
-- ─────────────────────────────────────────────────────────────────
-- 남헌 2026-09-16 결정 — 리스크를 알고 진행한다 (SP-025)
--
-- 다모앙 robots.txt 는 anthropic-ai·Claude-Web·GPTBot·CCBot 등 AI 학습
-- 크롤러를 "AI 크롤러 차단 (콘텐츠 학습 방지)" 항목으로 전면 금지하고,
-- `trend-archive/0.1` · `CollectorHub/0.1` 같은 **자칭 수집기**도 이름을
-- 확인하는 대로 추가하고 있다. 우리 UA 는 아직 그 목록에 없어 기계 판정은
-- allowed 지만, 사이트의 거부 의사가 우리 용도를 덮는다는 사실을 인지한
-- 채로 수집을 진행하기로 사람이 결정했다.
--
-- 그래서 두 소스 모두 **enabled=false 로 등록한다.** 이용약관 원문 확인까지
-- 끝난 뒤 사람이 켠다. 킬스위치를 미리 걸어 둔 상태로 시작하는 것이지,
-- 문제가 생기면 그때 끄는 게 아니다.
--
--   update public.review_sources set enabled = true where key = 'damoang';
--   update public.review_sources set enabled = true where key = '82cook';
-- ─────────────────────────────────────────────────────────────────
--
-- 간격·상한이 기존 소스보다 보수적인 이유: 공식 API 가 아니라 개인이 운영하는
-- 커뮤니티다. 다나와(1000ms/200) 기준을 그대로 쓰면 남의 서버에 과하다.
--   min_interval_ms   3000  (기존 1000~2000 → 3초)
--   daily_request_cap 100   (기존 200 → 절반)
-- 1글=1요청이므로 상한 100 은 하루 100글이다. 충분하다.

INSERT INTO public.review_sources (
  key, display_name, enabled, disabled_reason, health, min_interval_ms, daily_request_cap
) VALUES
  (
    'damoang',
    '다모앙 게시글·댓글',
    false,
    '실물 셀렉터 재확인 완료(2026-09-16) + robots 실측 완료. 사이트 이용약관 원문 확인 전까지 꺼둠 — SP-025 참조',
    'ok',
    3000,
    100
  ),
  (
    '82cook',
    '82cook 게시글·댓글',
    false,
    '실물 셀렉터 재확인 완료(2026-09-16) + robots 실측 + UTF-8 인코딩 확인 완료. 사이트 이용약관 원문 확인 전까지 꺼둠',
    'ok',
    3000,
    100
  )
ON CONFLICT (key) DO NOTHING;

COMMENT ON COLUMN public.review_targets.product_ref IS
  '소스 안에서 수집 대상을 가리키는 값. danawa=pcode / appstore=<국가>:<앱ID> / hackernews=q:<키워드> / '
  'damoang·82cook=url:<글 경로>. '
  '어느 값을 붙일지는 사람이 정한다 — 시스템이 키워드로 상품을 검색해 후보 중 하나를 자동 선택하지 않는다. '
  'hackernews 의 q: 는 상품 식별자가 아니라 질의 자체이며, 한 질의에 여러 스레드가 걸리는 것이 정상 동작이다. '
  'damoang·82cook 의 url: 은 **경로만** 담는다(호스트는 어댑터 상수). 호스트를 넣게 하면 SSRF 가 되므로 '
  'lib/review/adapters/url-ref.ts 가 ''..'' ''//'' ''@'' 와 공백을 거부한다. '
  '이 두 소스는 1글=1요청이라 수집 후 타깃이 status=exhausted 로 닫힌다 — 나중에 달린 댓글을 받으려면 '
  '사람이 status=''active'' 로 되돌려야 한다(자동 재활성화 없음).';

-- 확인용 (실행 후 눈으로 볼 것):
--   select key, enabled, health, min_interval_ms, daily_request_cap
--   from public.review_sources order by key;
--
-- 기대: 82cook / appstore / damoang / danawa / hackernews ... 순,
--       82cook 과 damoang 이 enabled=false · 3000 · 100.
