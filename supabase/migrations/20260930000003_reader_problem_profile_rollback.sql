-- ============================================================
-- 20260930000003_reader_problem_profile — 롤백
--
-- 🔴 파괴적이다. 실행하면 사라진다:
--     · seller_profiles.reader_problem / .competitor_url — 사람이 직접 적은 프로필 값.
--       재생성 경로가 없다(그 사람만 안다).
--     · analysis_projects.reader_problem — 프로젝트 생성 시점 스냅샷. 다시 만들 수 없다
--       (지금의 프로필 값으로 되채우면 그건 스냅샷이 아니라 짐작이다).
--
-- 그래서 CLAUDE.md §10.2 의 "되돌리기 어려운 삭제(DROP COLUMN)" 예외에 해당한다 — **사람만 실행한다.**
-- 세션이 자체 판단으로 돌리지 않는다.
--
-- 지우기 전에 남길 것 (없으면 이 파일을 돌리지 마라):
--   SELECT owner_email, reader_problem, competitor_url FROM public.seller_profiles
--    WHERE reader_problem IS NOT NULL OR competitor_url IS NOT NULL;
--   SELECT id, created_at, reader_problem FROM public.analysis_projects WHERE reader_problem IS NOT NULL;
--
-- 되돌린 뒤에는 앱도 같이 되돌려야 한다 — FACET_KEYS 에 reader_problem 이 남아 있으면
-- POST /api/analyze/projects · PUT /api/profile 이 다시 PGRST204 경로(키 제거 후 1회 재시도)로 돈다.
-- ============================================================

BEGIN;

ALTER TABLE public.seller_profiles
  DROP CONSTRAINT IF EXISTS seller_profiles_reader_problem_format;
ALTER TABLE public.seller_profiles
  DROP COLUMN IF EXISTS reader_problem,
  DROP COLUMN IF EXISTS competitor_url;

ALTER TABLE public.analysis_projects
  DROP CONSTRAINT IF EXISTS analysis_projects_reader_problem_format;
ALTER TABLE public.analysis_projects
  DROP COLUMN IF EXISTS reader_problem;

COMMIT;

-- 확인 (0행이어야 한다):
--   SELECT table_name, column_name FROM information_schema.columns
--    WHERE (table_name = 'seller_profiles'   AND column_name IN ('reader_problem','competitor_url'))
--       OR (table_name = 'analysis_projects' AND column_name = 'reader_problem');
