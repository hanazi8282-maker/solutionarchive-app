-- post_performance 뷰 SECURITY INVOKER 전환 + 트리거 함수 2개 search_path 고정
--
-- 배경: Supabase 어드바이저(2026-09-21) — `security_definer_view`(post_performance, ERROR) ·
-- `function_search_path_mutable`(guard_learning_promotion · guard_hypothesis_promotion, WARN).
--
-- 뷰가 DEFINER 였던 건 의도가 아니다. 20260827000001 은 옵션 없는 `CREATE OR REPLACE VIEW` 였고,
-- Postgres 뷰의 기본이 정의자(postgres, bypassrls) 권한이라 그렇게 됐을 뿐이다. 그 결과 anon/authenticated
-- 키로 PostgREST `post_performance` 를 치면 RLS(정책 0개 = service_role 전용)가 걸린 posts·metric_snapshots 를
-- 뷰가 대신 읽어 줬다 — 실측 35행 노출(발행 시각·조회수·답글수 같은 성과 집계).
--
-- 호출자 실측(전부 service_role): lib/insight/loop.ts · lib/insight/patterns.ts(server.ts 클라이언트),
-- scripts/threads-report.mjs(SUPABASE_SERVICE_ROLE_KEY 필수), guard_hypothesis_promotion 트리거(호출 롤 그대로 실행).
-- 브라우저 anon 클라이언트 import 0건. 그러므로 INVOKER 로 바꿔도 앱·배치·트리거는 그대로 돈다.
--
-- 🟢 비파괴. 행·컬럼 무변경. 뷰 옵션 1개 + REVOKE + ALTER FUNCTION SET 2개. 롤백 파일 있음.
-- 적용: 대화형 세션 자체 판단(§10.2 — 예외 5개 해당 없음, 보안 경계를 **좁히는** 변경).

-- 1) 뷰: 호출자 권한으로. service_role 은 bypassrls 라 그대로, anon/authenticated 는 밑 테이블 RLS 로 0행.
ALTER VIEW public.post_performance SET (security_invoker = true);
-- 2) 뷰 자체 권한도 걷는다 — 기본 GRANT ALL 이 anon/authenticated 에 있었다. 이제 0행이 아니라 42501 로 거부.
REVOKE ALL ON public.post_performance FROM anon, authenticated;
-- 3) 트리거 함수: search_path 고정(스키마 하이재킹 차단). 본문은 이미 public. 로 한정해 부르고 있다.
ALTER FUNCTION public.guard_learning_promotion()   SET search_path = public, pg_temp;
ALTER FUNCTION public.guard_hypothesis_promotion() SET search_path = public, pg_temp;

-- 확인 쿼리 (적용 후):
--   select reloptions from pg_class where relname='post_performance';           -- {security_invoker=true}
--   select grantee, privilege_type from information_schema.role_table_grants
--    where table_name='post_performance';                                        -- anon/authenticated 없음
--   select proname, proconfig from pg_proc where proname like 'guard_%';         -- 둘 다 {search_path=public, pg_temp}
--   anon 키로 GET /rest/v1/post_performance?select=id  → 401/42501 (차단)
