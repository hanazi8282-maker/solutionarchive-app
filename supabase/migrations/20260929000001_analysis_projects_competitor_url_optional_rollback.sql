-- 20260929000001_analysis_projects_competitor_url_optional.sql 되돌리기.
--
-- ⚠️ 제약을 **다시 거는** 방향이라, 그 사이에 competitor_url IS NULL 인 행이 하나라도
--    생겼으면 ALTER 가 실패한다. 실패하는 게 맞다 — 조용히 더미 URL 로 채우면 그 프로젝트가
--    실제로 경쟁사 없이 만들어졌다는 사실이 영영 사라진다(§7.1). 먼저 아래로 세고,
--    무엇을 할지는 사람이 정한다.
--
--   SELECT count(*) FROM public.analysis_projects WHERE competitor_url IS NULL;

ALTER TABLE public.analysis_projects ALTER COLUMN competitor_url SET NOT NULL;

COMMENT ON COLUMN public.analysis_projects.competitor_url IS NULL;

-- 확인: is_nullable 이 NO 로 돌아왔는가.
--   SELECT column_name, is_nullable FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='analysis_projects' AND column_name='competitor_url';
