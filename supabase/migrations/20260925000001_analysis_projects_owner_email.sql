-- analysis_projects.owner_email — 재사용률·ARPU·소스비용 벤치마크 측정 준비 (2026-09-21 남헌 승인, 후속 지시 4번)
--
-- 적용: CLAUDE.md §10.2 자체 판단. ADD COLUMN IF NOT EXISTS 1개 + 인덱스 1개. 기존 24행은 NULL 로 남긴다 — 누가 만들었는지
--       기록이 없으니 추정해 채우지 않는다(§7.1). 발굴 엔진(discovery-run)이 만드는 행도 NULL 이다(사람이 아니다).
-- 채우는 곳: app/api/analyze/projects/route.ts POST 가 세션 이메일을 넣는다. 본문 값은 받지 않는다.

ALTER TABLE public.analysis_projects ADD COLUMN IF NOT EXISTS owner_email text;
CREATE INDEX IF NOT EXISTS analysis_projects_owner_idx ON public.analysis_projects (owner_email, created_at DESC);
COMMENT ON COLUMN public.analysis_projects.owner_email IS
  '프로젝트를 만든 로그인 이메일(세션에서만 채운다). 재사용률·ARPU·소스비용 벤치마크 측정 준비용(2026-09-21 남헌 승인). 기존 24행과 발굴 엔진이 만든 행은 NULL — 추정해 채우지 않는다.';

-- 확인: SELECT count(*) FILTER (WHERE owner_email IS NOT NULL), count(*) FROM public.analysis_projects;
