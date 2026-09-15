-- RLS 가 꺼져 있던 7개 테이블을 켠다. 정책은 만들지 않는다.
--
-- 왜: 이 테이블들은 만들 때부터 "service_role 전용" 주석이 달렸는데 RLS 를 켜지 않아
-- 브라우저 번들에 들어가는 anon 키(NEXT_PUBLIC_SUPABASE_ANON_KEY, lib/supabase/client.ts)로
-- PostgREST 를 직접 치면 전 행 읽기·쓰기가 됐다. Google 로그인 허용목록은 앱 라우트만 막는다.
-- 근거: reports/2026-09-15-code-audit.md 4-2, Supabase 어드바이저 rls_disabled.
--
-- 효과: RLS ON + 정책 0 = anon/authenticated 차단, service_role 은 RLS 를 우회하므로
-- 서버 스크립트(cmo-daily·review-collect·insight-loop·Vercel 크론)는 영향 없다.
-- 이 리포의 다른 테이블들도 전부 같은 방식(RLS ON, 정책 0)이다.
--
-- 롤백: 20260915000002_enable_rls_service_only_rollback.sql

BEGIN;
ALTER TABLE public.post_replies         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_run_steps      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_queue       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pmf_assessments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pmf_assessment_moves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notion_sync_log      ENABLE ROW LEVEL SECURITY;
COMMIT;
