-- content_columns 에 케이스 링크·발행일 두 컬럼. 비파괴(둘 다 NULL 허용 신규 컬럼, 기존 행 건드리지 않음).
--
-- 왜: 공개 읽기 화면(/columns/read/<slug>)이 "이 칼럼의 근거 케이스"로 넘어갈 자리가 없다.
--   case_study_slug — case_studies.slug 를 텍스트로 담는다. FK 를 걸지 않는 이유: 칼럼은 케이스가
--     기각·재적립되어도 읽을 수 있어야 하고, FK 를 걸면 케이스 삭제가 칼럼 적재를 막는다.
--     끊어진 링크는 화면에서 "케이스 없음"으로 보이지, 데이터가 깨지지 않는다.
--   published_at  — 공개 시각. NULL 이면 화면은 staged_at(적재 시각)으로 떨어진다.
--     "발행됐다"와 "적재만 됐다"를 같은 값으로 접지 않으려고 컬럼을 따로 둔다(§7.1).
--
-- 값을 채우는 것은 이 파일이 아니다. case_study_slug 는 scripts/column-stage.mjs 가 칼럼 md 의
-- `case_slug:` 줄에서 읽어 싣고, published_at 은 사람이 공개할 때 넣는다. 백필 없음.
--
-- 적용: supabase db query --linked -f supabase/migrations/20260929000003_content_columns_case_slug.sql
-- 롤백: 20260929000003_content_columns_case_slug_rollback.sql (컬럼 DROP — 사람 판단, CLAUDE.md §10.2)

ALTER TABLE public.content_columns ADD COLUMN IF NOT EXISTS case_study_slug text NULL;
ALTER TABLE public.content_columns ADD COLUMN IF NOT EXISTS published_at    timestamptz NULL;

COMMENT ON COLUMN public.content_columns.case_study_slug IS
  '이 칼럼의 근거 케이스 slug(case_studies.slug). FK 아님 — 케이스가 없어도 칼럼은 읽힌다.';
COMMENT ON COLUMN public.content_columns.published_at IS
  '공개 시각. NULL = 아직 발행 안 함(적재만 됨). 화면은 NULL 일 때 staged_at 을 쓴다.';

-- 확인 쿼리 (적용 후 직접 돌린다 — 도구가 준 success 만으로 보고하지 않는다, §10.2 절차 4)
--   양성: 두 컬럼이 존재하고 nullable 이어야 한다 → 2행, is_nullable 전부 YES
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='content_columns'
--    AND column_name IN ('case_study_slug','published_at') ORDER BY column_name;
--
--   음성: 기존 행이 하나도 안 깨졌는지 — 값은 전부 NULL 이어야 한다(백필 없음)
-- SELECT count(*) AS total, count(case_study_slug) AS with_case, count(published_at) AS published
--   FROM public.content_columns;
