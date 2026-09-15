-- VOC 수집 소스 확장 — 네이버(블로그·카페·지식iN) / YouTube / Reddit 5행 등록
--
-- 어댑터: lib/review/adapters/naver.ts · youtube.ts · reddit.ts
-- 실측·약관: docs/review-source-findings.md "3차 소스 실측 (2026-09-16)"
--            docs/strategy-principles.md SP-024 ~ SP-028
--
-- 🟢 비파괴. 새 행 5개 + 주석 갱신. 기존 danawa/appstore/hackernews 행은 안 건드린다.
--
-- ⚠️ **선행 의존** — 이 마이그레이션 전에는 신규 소스 적재가 전부 FK 위반으로 막힌다.
--    `analysis_inputs.source_key` 와 `review_targets.source_key` 가 둘 다
--    `review_sources(key)` 를 참조한다. 즉 여기 행이 없으면
--      · review_targets INSERT      → 23503 foreign key violation
--      · analysis_inputs INSERT(수집) → 23503 foreign key violation
--    이다. 어댑터·워크플로가 다 있어도 이 파일을 적용하기 전에는 수집이 0건이다.
--    (반대로 말하면, 적용해도 아래 enabled=false 때문에 저절로 돌지는 않는다.)
--
-- ⚠️ **5행 전부 enabled=false 로 들어간다.** 사람이 켜야 수집이 시작된다.
--    킬스위치를 "이미 걸어둔 상태"로 시작하는 것이지, 문제가 생기면 그때
--    끄는 게 아니다(hackernews 등록 때와 같은 방식).
--
--    켜기 전에 반드시 끝내야 할 것이 소스마다 다르다 — disabled_reason 에 적었다.
--
-- 적용(사람이 한다, CLAUDE.md §10.1):
--   supabase db query --linked -f supabase/migrations/20260916000003_review_sources_expand.sql

INSERT INTO public.review_sources (
  key, display_name, enabled, disabled_reason, health, min_interval_ms, daily_request_cap
) VALUES
  (
    'naver_blog',
    '네이버 블로그 검색 (오픈API)',
    false,
    '자격증명 미발급(NAVER_CLIENT_ID/SECRET) + 약관 저장·가공 제한 검토 필요 — SP-025 참조. '
    '응답은 리뷰 전문이 아니라 검색 스니펫이다.',
    'ok', 1000, 200
  ),
  (
    'naver_cafe',
    '네이버 카페글 검색 (오픈API)',
    false,
    '자격증명 미발급 + 응답에 작성일 필드가 없어 증분 종료가 성립하지 않는다(매 실행 1페이지부터 재훑음, '
    '지문 중복으로 재적재는 없고 20페이지 상한에서 정지) — SP-025 / findings §3차 참조.',
    'ok', 1000, 200
  ),
  (
    'naver_kin',
    '네이버 지식iN 검색 (오픈API)',
    false,
    '자격증명 미발급 + **응답 실물 미확인**. 어댑터가 title/link/description 만 읽는다(지식iN 고유 필드는 '
    '짐작으로 넣지 않았다). 실물 응답 1건을 받아 필드를 확인한 뒤 켠다.',
    'ok', 1000, 200
  ),
  (
    'youtube',
    'YouTube 댓글 (Data API v3)',
    false,
    '🔴 약관 제약 미해소 — Developer Policies III.E.4.d 는 비인증 API 데이터를 30일 초과 저장 금지, '
    '같은 문서가 API Data 기반 파생 데이터 생성을 제한한다(우리 파이프라인은 소구점을 추출 = 파생). '
    'SP-026 참조. 원문 폐기 배치(REVIEW_PURGE_APPLY)가 실제로 켜져 있어야 30일 조건을 만족한다.',
    'ok', 1000, 200
  ),
  (
    'reddit',
    'Reddit 포스트 (Data API)',
    false,
    '약관 리스크 인지 후 남헌 승인으로 활성화 — SP-024 참조. 라이선스 변경 시 즉시 중단',
    'ok', 1000, 200
  )
ON CONFLICT (key) DO NOTHING;

COMMENT ON COLUMN public.review_targets.product_ref IS
  '소스 안에서 수집 대상을 가리키는 값. '
  'danawa=pcode / appstore=<국가>:<앱ID> / hackernews=q:<키워드> / '
  'naver_blog·naver_cafe·naver_kin=q:<검색어> / youtube=v:<영상ID 11자> / reddit=q:<검색어>. '
  '어느 값을 붙일지는 사람이 정한다 — 시스템이 키워드로 상품을 검색해 후보 중 하나를 자동 선택하지 않는다. '
  'q: 는 상품 식별자가 아니라 질의 자체이며, 한 질의에 여러 글이 걸리는 것이 정상 동작이다. '
  '⚠️ hackernews 의 q: 는 토큰 전부(AND)가 제목+본문에 있어야 통과하므로 1~2토큰으로 좁게 적는다 — '
  '4토큰짜리 질의는 0건이 나오고 그 0건은 filtered 로 잡혀 health 가 계속 ok 로 뜬다(조용한 실패). '
  '⚠️ youtube 의 v: 는 **댓글이 켜져 있는 영상**이어야 한다. 댓글이 꺼진 영상은 403 commentsDisabled 를 '
  '주고 러너가 그것을 차단으로 분류해 소스를 통째로 끈다.';

-- 확인용 (실행 후 눈으로 볼 것):
--   select key, enabled, health, min_interval_ms, daily_request_cap
--   from public.review_sources order by key;
--
-- 기대: appstore / danawa / hackernews / naver_blog / naver_cafe / naver_kin / reddit / youtube 8행,
--       이번에 들어간 5행은 전부 enabled=false.
