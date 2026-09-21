-- seller_profiles · wtp_signals RLS 활성화 + 소유자 정책
--
-- 배경: Supabase 어드바이저 critical `rls_disabled_in_public` 2건(2026-09-21). 두 테이블은 앱에서
-- **서버 라우트(service_role)만** 읽고 쓴다(app/api/profile, app/api/analyze/wtp — lib/supabase/server.ts).
-- 그런데 RLS 가 꺼져 있어 anon 키로 PostgREST 를 직접 치면 전 행이 읽혔다(owner_email 포함).
--
-- 🟢 비파괴. 행·컬럼 무변경. DDL 은 ENABLE/FORCE RLS + CREATE POLICY 뿐. 롤백 파일 있음.
--
-- 정책 설계 (남헌 2026-09-21 지시):
--   · 소유자만 자기 행 — `owner_email = lower(auth.jwt() ->> 'email')`. authenticated 롤에만 준다.
--     anon 은 정책 0개 = 전면 차단(RLS 기본값).
--   · service_role 은 정책 우회 — pg_roles.rolbypassrls = true 라 앱 라우트·배치 스크립트는 영향 없다.
--     FORCE 는 테이블 소유자(postgres, 대시보드 SQL 에디터)도 정책을 따르게 하는 것이지 service_role 과 무관.
--   · DELETE 정책은 두지 않는다 — 앱에 삭제 경로가 없고, 이력(wtp_signals)은 지우지 않는 설계다.
--   · 앱은 아직 사용자 세션으로 DB 를 치지 않으므로(server.ts TODO), 이 정책은 지금 당장은 anon 차단이
--     실효이고 authenticated 정책은 세션 기반 클라이언트로 갈 때를 위한 것이다.
--
-- 적용: 대화형 세션 자체 판단(§10.2 — 삭제·데이터 변경·키 노출·법적·사업방향 해당 없음. 보안 경계를 **좁히는** 변경).
--   적용 전 BEGIN…ROLLBACK 으로 anon 차단·authenticated 소유자 제한·타인 행 차단·service_role 우회를 실측한다.

ALTER TABLE public.seller_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_profiles FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.wtp_signals     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wtp_signals     FORCE  ROW LEVEL SECURITY;

-- seller_profiles: 로그인 이메일당 1행. 자기 행만 읽고·만들고·고친다.
DROP POLICY IF EXISTS seller_profiles_owner_select ON public.seller_profiles;
DROP POLICY IF EXISTS seller_profiles_owner_insert ON public.seller_profiles;
DROP POLICY IF EXISTS seller_profiles_owner_update ON public.seller_profiles;
CREATE POLICY seller_profiles_owner_select ON public.seller_profiles
  FOR SELECT TO authenticated
  USING (owner_email = lower(auth.jwt() ->> 'email'));
CREATE POLICY seller_profiles_owner_insert ON public.seller_profiles
  FOR INSERT TO authenticated
  WITH CHECK (owner_email = lower(auth.jwt() ->> 'email'));
CREATE POLICY seller_profiles_owner_update ON public.seller_profiles
  FOR UPDATE TO authenticated
  USING (owner_email = lower(auth.jwt() ->> 'email'))
  WITH CHECK (owner_email = lower(auth.jwt() ->> 'email'));

-- wtp_signals: 답한 사람만 자기 이력을 읽고 새 답을 남긴다. 수정·삭제 없음(이력).
DROP POLICY IF EXISTS wtp_signals_owner_select ON public.wtp_signals;
DROP POLICY IF EXISTS wtp_signals_owner_insert ON public.wtp_signals;
CREATE POLICY wtp_signals_owner_select ON public.wtp_signals
  FOR SELECT TO authenticated
  USING (owner_email = lower(auth.jwt() ->> 'email'));
CREATE POLICY wtp_signals_owner_insert ON public.wtp_signals
  FOR INSERT TO authenticated
  WITH CHECK (owner_email = lower(auth.jwt() ->> 'email'));

COMMENT ON POLICY seller_profiles_owner_select ON public.seller_profiles IS
  '소유자(세션 이메일)만. service_role 은 우회(앱 서버 라우트 경로). anon 은 정책 없음 = 차단.';
COMMENT ON POLICY wtp_signals_owner_select ON public.wtp_signals IS
  '답한 사람만 자기 이력. service_role 우회. 삭제 정책 없음 — 이력은 지우지 않는다.';

-- 확인 쿼리 (적용 후):
--   select relname, relrowsecurity, relforcerowsecurity from pg_class
--    where relname in ('seller_profiles','wtp_signals');                     -- 둘 다 true / true
--   select tablename, policyname, roles, cmd from pg_policies
--    where tablename in ('seller_profiles','wtp_signals') order by 1,2;      -- 5행, roles {authenticated}
--   anon 키로 GET /rest/v1/seller_profiles?select=id  → [] (행 0, 200) 또는 401
