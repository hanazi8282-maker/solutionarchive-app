-- 20260915000002_enable_rls_service_only 롤백. 되돌리면 anon 키 노출이 재발한다.
BEGIN;
ALTER TABLE public.post_replies         DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_runs           DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_run_steps      DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_queue       DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.pmf_assessments      DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.pmf_assessment_moves DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.notion_sync_log      DISABLE ROW LEVEL SECURITY;
COMMIT;
