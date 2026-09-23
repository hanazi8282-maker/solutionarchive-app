-- ============================================================
-- 20260930000003_reader_problem_profile
--
-- 프로필 → 케이스 추천 → 경쟁사 리뷰 분석을 잇는 컬럼 3개. 새 테이블 0개.
--   seller_profiles.reader_problem   — 추천의 유일한 케이스 하드필터 축
--   seller_profiles.competitor_url   — /analyze/new 1단계 프리필 전용(선택)
--   analysis_projects.reader_problem — 프로젝트 생성 시점의 문제 유형 스냅샷
--
-- 근거: docs/profile-recommend-analysis-design.md §데이터 변경 (남헌 2026-09-23 Q1~Q5 확정:
--       stage 어휘 신설 안 함 / 프리필은 문제유형+pitch·market / competitor_url 프로필 저장 /
--       등급 배지는 displayGrade() 껍데기만 / 0건이어도 소비재 자동 혼합 없음).
--       새 테이블을 만들지 않는 이유: seller_profiles 가 이미 "로그인 이메일당 1행"이고
--       /analyze/new 프리필 경로가 그 테이블을 본다. 하나 더 만들면 같은 사람의 프로필이 두 곳에 생긴다.
--
-- 🟢 비파괴. 전부 ADD COLUMN IF NOT EXISTS · 전부 nullable · 백필 0건 · 기존 행을 건드리지 않는다.
--    롤백 파일 있음(`..._rollback.sql`).
--    CLAUDE.md §10.2 사람 판단 예외 5개 **해당 없음**:
--      1) 되돌리기 어려운 삭제 — DROP/DELETE/타입 축소 0건 (이 파일은 ADD 만 한다)
--      2) 프로덕션 데이터 손상 — 백필·대량 UPDATE 없음. 새 CHECK 은 새 컬럼만 보고, 기존 행은 전부 NULL 이라 통과한다
--      3) 키·인증 경계 — env·시크릿·lib/auth/* ·RLS 정책을 건드리지 않는다(seller_profiles 정책은 20260927000001 그대로)
--      4) 새 법적 리스크 — 수집 소스 신규 추가 아님, 발행 API 아님
--      5) 사업 방향 결정 — 가격·브랜딩·타깃 독자 정의를 바꾸지 않는다(어휘는 기존 config/reader-problems.json 재사용)
--
-- ⚠️ **배포 전 적용 필요.** 이 마이그레이션이 앱 배포보다 먼저 가야 한다 —
--    FACET_KEYS 에 reader_problem 이 들어가므로 POST /api/analyze/projects 와 PUT /api/profile 이
--    그 키를 INSERT/UPSERT 에 싣고, 컬럼이 없으면 PostgREST 가 **PGRST204**(또는 42703)로 거절한다.
--    미적용 상태의 방어막: 두 라우트가 그 코드를 만나면 해당 키를 빼고 1회 재시도하고
--    "마이그 20260930000003 미적용" 을 로그에 남긴다(조용히 무시하지 않는다, §7.1).
--    방어막이 걸린 실행은 성공이 아니라 확인 대상이다(§7.2) — 로그에 그 줄이 보이면 이 파일을 적용해라.
--
-- ⚠️ 미적용 — 서브에이전트가 만든 파일이다(§10.2: 서브에이전트는 판단 주체가 아니다).
--    사람 또는 대화형·역할 세션이 적용한다. 절차:
--      1) 대상이 solutionarchive `qmgrfqjfxqhxuufrnkwf` 인지 확인(Dothegy OS 아님).
--      2) information_schema 로 이미 있는지 확인 — PostgREST head:true 는 없는 테이블에도 204 를 준다(§7.1).
--      3) 이 파일 실행 → 하단 확인 쿼리(양성·음성)를 눈으로 본다.
--      4) docs/migration-exceptions.md 에 한 줄 남긴다.
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1) seller_profiles — 문제 유형 + 경쟁사 URL
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.seller_profiles
  ADD COLUMN IF NOT EXISTS reader_problem text,
  ADD COLUMN IF NOT EXISTS competitor_url text;

-- ────────────────────────────────────────────────────────────
-- 2) analysis_projects — 생성 시점의 문제 유형 스냅샷
--    백필하지 않는다. 기존 행은 NULL 로 남고, 그건 "미지정"이 아니라 "그 시점엔 묻지 않았다"다.
-- ────────────────────────────────────────────────────────────
ALTER TABLE public.analysis_projects
  ADD COLUMN IF NOT EXISTS reader_problem text;

-- ────────────────────────────────────────────────────────────
-- 3) CHECK 은 **형식만** 본다 — case_studies.reader_problem 과 같은 규약(20260915000001).
--    어휘를 CHECK 에 박지 않는 이유: config/reader-problems.json 이 "잠정, 자료가 오면 통째로
--    갈아끼운다"라고 적고 있다. enum CHECK 은 그 교체를 파괴적 마이그레이션으로 만든다.
--    어휘 검증은 앱(parseFacets → VOCAB.reader_problem)이 400 으로 막는다.
-- ────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'seller_profiles_reader_problem_format') THEN
    ALTER TABLE public.seller_profiles
      ADD CONSTRAINT seller_profiles_reader_problem_format
      CHECK (reader_problem IS NULL OR reader_problem ~ '^[A-Z][A-Z_]*$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'analysis_projects_reader_problem_format') THEN
    ALTER TABLE public.analysis_projects
      ADD CONSTRAINT analysis_projects_reader_problem_format
      CHECK (reader_problem IS NULL OR reader_problem ~ '^[A-Z][A-Z_]*$');
  END IF;
END $$;

COMMENT ON COLUMN public.seller_profiles.reader_problem IS
  '독자 문제(config/reader-problems.json 어휘). 케이스 추천의 유일한 하드필터 축. CHECK 은 형식만 본다.';
COMMENT ON COLUMN public.seller_profiles.competitor_url IS
  '경쟁사·비교 대상 URL(선택). /analyze/new 1단계 프리필 전용. 검증은 parseCompetitorUrl(mode=forward). 쿼리스트링으로 넘기지 않는다 — 사용자 입력 URL 이 리퍼러·액세스 로그에 남는다.';
COMMENT ON COLUMN public.analysis_projects.reader_problem IS
  '프로젝트 생성 시점의 독자 문제 스냅샷. 백필하지 않는다(기존 행은 NULL).';

COMMIT;

-- ============================================================
-- 확인 쿼리 — 적용 후 사람이 직접 돌린다. 도구가 준 success 로 보고하지 않는다(§10.2 절차 4).
-- ============================================================
-- 양성 (컬럼 3행이 나와야 한다):
--   SELECT table_name, column_name, is_nullable, data_type
--     FROM information_schema.columns
--    WHERE (table_name = 'seller_profiles'   AND column_name IN ('reader_problem','competitor_url'))
--       OR (table_name = 'analysis_projects' AND column_name = 'reader_problem')
--    ORDER BY table_name, column_name;
--
-- 양성 (제약 2행):
--   SELECT conname FROM pg_constraint
--    WHERE conname IN ('seller_profiles_reader_problem_format','analysis_projects_reader_problem_format');
--
-- 무변경 (백필 0건 — 새 컬럼에 값이 들어간 행이 없어야 한다):
--   SELECT count(*) FROM public.seller_profiles   WHERE reader_problem IS NOT NULL OR competitor_url IS NOT NULL;  -- 0
--   SELECT count(*) FROM public.analysis_projects WHERE reader_problem IS NOT NULL;                                -- 0
--
-- 음성 (형식 CHECK 이 실제로 막는가 — 23514 여야 정상. 롤백되므로 데이터가 남지 않는다):
--   BEGIN;
--     INSERT INTO public.seller_profiles (owner_email, reader_problem)
--     VALUES ('selftest@example.com', 'lowercase bad');   -- 23514 기대
--   ROLLBACK;
