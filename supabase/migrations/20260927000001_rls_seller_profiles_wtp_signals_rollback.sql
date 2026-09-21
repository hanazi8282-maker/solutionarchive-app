-- 롤백: 20260927000001_rls_seller_profiles_wtp_signals.sql
-- 정책을 지우고 RLS 를 끈다(적용 전 상태 = 어드바이저 critical 로 되돌아간다). 행·컬럼 무변경.

DROP POLICY IF EXISTS seller_profiles_owner_select ON public.seller_profiles;
DROP POLICY IF EXISTS seller_profiles_owner_insert ON public.seller_profiles;
DROP POLICY IF EXISTS seller_profiles_owner_update ON public.seller_profiles;
DROP POLICY IF EXISTS wtp_signals_owner_select ON public.wtp_signals;
DROP POLICY IF EXISTS wtp_signals_owner_insert ON public.wtp_signals;

ALTER TABLE public.seller_profiles NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.seller_profiles DISABLE  ROW LEVEL SECURITY;
ALTER TABLE public.wtp_signals     NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.wtp_signals     DISABLE  ROW LEVEL SECURITY;
