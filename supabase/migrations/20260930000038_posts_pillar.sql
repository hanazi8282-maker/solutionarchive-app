-- ============================================================
-- 20260930000038_posts_pillar
--
-- posts 에 콘텐츠 필러(pillar) 분류 컬럼을 추가한다 — 케이스 / 숫자한줄 / 빌드로그 / VOC발굴.
--
-- 왜 필요한가
--   발행 8건을 4개 필러로 소급 분류하려는데, 기존 분류 컬럼 중 이 목적에 맞는
--   게 없다:
--     - content_code / hypothesis_code — 특정 소재·가설을 가리키는 FK. 필러가 아니다.
--     - pattern                        — score-predictions.mjs 가 "형식"(캡션형/기획형)으로
--                                         쓰는 정수 코드. 필러와 무관한 축이다.
--     - hook_type / closing_type       — 카피 층위(훅·마무리 방식). 필러와 다른 축이다.
--     - topic_tag                      — 이미 **두 가지 다른 뜻으로 겹쳐 쓰이고 있다**:
--                                         (a) case-draft-stage.mjs/column-threads-stage.mjs 는
--                                             'case-study'/'column'(콘텐츠가 어느 스테이징
--                                             경로에서 왔는지)을 넣고,
--                                         (b) threads-drafts-save.mjs 는 "이커머스" 같은
--                                             자유 주제 태그로 쓴다.
--                                         여기 필러(3번째 뜻)까지 얹으면 같은 컬럼에 세
--                                         가지 서로 다른 의미가 섞여 어느 값이 무슨 뜻인지
--                                         알 수 없게 된다. 그래서 재사용하지 않는다.
--   그래서 새 nullable 컬럼 하나를 추가한다(남헌 승인 불요 — §10.2 "프로덕션 데이터
--   손상 위험"에 해당하지 않는 순수 추가형 스키마 변경. 기존 행은 전부 NULL로 시작).
--
-- 값 4개 — CLAUDE.md 어디에도 아직 정의가 없어 여기 주석으로 남긴다:
--   케이스    — 남의 브랜드 실측(case_moves 인용)을 옮긴 글.
--   숫자한줄  — 수치 한 줄이 중심인 짧은 형.
--   빌드로그  — 우리가 만드는 과정을 공개하는 글(예: 09-07 T3-1, 09-23~25 build-in-public 4건).
--   VOC발굴   — 고객 목소리 발굴 과정·결과를 다루는 글.
--
-- NULL 을 허용하는 이유
--   이 컬럼이 생기기 전에 발행된 글(과 앞으로 분류를 놓친 글)은 "필러가 없다"가
--   아니라 "아직 분류 안 함"이다. DEFAULT 를 넣지 않는다 — 임의의 기본값은
--   "분류했더니 이거였다"와 "분류 안 함"을 구분 못 하게 만든다(CLAUDE.md §7.1).
--
-- 소급 UPDATE 8건 — 이 마이그레이션은 컬럼만 만든다. 값 채우기는 별도로
--   남헌/오케스트레이터가 대조 확인 후 실행한다(§10.2 "대량 UPDATE" 절차 —
--   8행이라 소규모지만 같은 확인 절차를 따른다). UPDATE 문은
--   reports/<적용일>/ 아래 보고서에 있다.
--
-- 실행 방법 (§12-5)
--   CLI/MCP 로 실행하지 않는다. Supabase 대시보드 SQL Editor 에서만 실행한다.
--   프로젝트 ref: qmgrfqjfxqhxuufrnkwf
--
-- 🟢 비파괴. 컬럼 추가 + CHECK 하나뿐. 기존 행·쿼리에 영향 없음(전부 NULL 통과).
-- 롤백: 20260930000038_posts_pillar_rollback.sql
-- ============================================================

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS pillar text;

ALTER TABLE public.posts
  DROP CONSTRAINT IF EXISTS posts_pillar_check;

ALTER TABLE public.posts
  ADD CONSTRAINT posts_pillar_check
    CHECK (pillar IS NULL OR pillar IN ('케이스', '숫자한줄', '빌드로그', 'VOC발굴'));

COMMENT ON COLUMN public.posts.pillar IS
  '콘텐츠 필러 분류 — 케이스 / 숫자한줄 / 빌드로그 / VOC발굴. NULL = 아직 분류 안 함. '
  'topic_tag(스테이징 출처·자유 주제 태그로 이미 겹쳐 쓰임)와 다른 축이라 별도 컬럼으로 뗐다.';

-- ────────────────────────────────────────────────────────────
-- 검증 쿼리 (적용 직후 실행)
-- ────────────────────────────────────────────────────────────
-- 1) 컬럼·제약이 붙었는가
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'posts' AND column_name = 'pillar';
--   기대: pillar | text | YES
--
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'posts_pillar_check';
--   기대: CHECK (pillar IS NULL OR pillar = ANY (ARRAY['케이스','숫자한줄','빌드로그','VOC발굴']))
--
-- 2) 기존 행은 전부 NULL 인가(분류를 지어내지 않았는가)
-- SELECT pillar, count(*) FROM public.posts GROUP BY pillar;
--   기대: 전 행 pillar IS NULL (이 마이그레이션은 값을 넣지 않는다)
--
-- 3) CHECK 가 실제로 막는가 — 아래는 에러가 나야 정상 (ROLLBACK 으로 되돌릴 것)
-- BEGIN;
--   UPDATE public.posts SET pillar = '아무거나' WHERE id = (SELECT id FROM public.posts LIMIT 1);
--   -- ERROR: new row violates check constraint "posts_pillar_check"
-- ROLLBACK;
