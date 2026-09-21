-- 롤백: 20260927000002_post_performance_invoker_search_path.sql
-- 적용 전 상태(뷰 정의자 권한 + 기본 GRANT + search_path 미고정 = 어드바이저 ERROR/WARN)로 되돌린다. 행·컬럼 무변경.

ALTER VIEW public.post_performance RESET (security_invoker);
GRANT ALL ON public.post_performance TO anon, authenticated;
ALTER FUNCTION public.guard_learning_promotion()   RESET search_path;
ALTER FUNCTION public.guard_hypothesis_promotion() RESET search_path;
