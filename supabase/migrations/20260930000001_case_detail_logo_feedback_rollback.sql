-- ============================================================
-- 20260930000001_case_detail_logo_feedback — 롤백
--
-- 🔴 파괴적이다. 실행하면 사라진다:
--     · case_studies.logo_url / brand_domain 에 사람이 넣은 값 (재생성 경로 없음 —
--       로고 주소·도메인은 사람이 확인해 적은 값이다)
--     · case_feedback 전 행 (독자가 남긴 표·한 줄. 다시 받을 방법이 없다)
--
-- 그래서 CLAUDE.md §10.2 의 "되돌리기 어려운 삭제" 예외에 해당한다 — **사람만 실행한다.**
-- 세션이 자체 판단으로 돌리지 않는다.
--
-- 지우기 전에 남길 것 (없으면 이 파일을 돌리지 마라):
--   SELECT slug, logo_url, brand_domain FROM public.case_studies
--    WHERE logo_url IS NOT NULL OR brand_domain IS NOT NULL;
--   SELECT * FROM public.case_feedback ORDER BY created_at;
-- ============================================================

BEGIN;

DROP TABLE IF EXISTS public.case_feedback;

ALTER TABLE public.case_studies
  DROP COLUMN IF EXISTS logo_url,
  DROP COLUMN IF EXISTS brand_domain;

COMMIT;

-- 확인
-- SELECT count(*) FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='case_studies'
--    AND column_name IN ('logo_url','brand_domain');   -- 기대: 0
-- SELECT count(*) FROM information_schema.tables
--  WHERE table_schema='public' AND table_name='case_feedback';  -- 기대: 0
