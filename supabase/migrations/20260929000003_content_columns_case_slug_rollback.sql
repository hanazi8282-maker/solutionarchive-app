-- 롤백: 20260929000003_content_columns_case_slug.sql
--
-- ⚠️ DROP COLUMN 이다 — CLAUDE.md §10.2 "되돌리기 어려운 삭제"라 사람 판단이 필요하다.
-- 적용 직후 되돌리는 경우에만 안전하다(두 컬럼 다 NULL). 값이 들어간 뒤라면 그 값은 사라진다:
--   SELECT count(case_study_slug), count(published_at) FROM public.content_columns;  -- 먼저 0 인지 본다
--
-- 코드는 두 컬럼이 없어도 돈다 — lib/columns/read.ts 가 select('*') 이고 화면은 옵셔널로 읽는다.

ALTER TABLE public.content_columns DROP COLUMN IF EXISTS case_study_slug;
ALTER TABLE public.content_columns DROP COLUMN IF EXISTS published_at;
