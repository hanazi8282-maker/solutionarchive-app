-- ============================================================
-- 20261103000020_report_pages — v71by: 비공개 결론서 링크 `/r/{token}` 의 본문·열람 기록
--
-- ⛔ 미적용 상태로 PR 에 올린다(서브에이전트 작성 — 적용은 오케스트레이터).
-- 무엇: report_pages(결론서 HTML 1장 = 1행, 토큰으로만 열림) + report_views(열람 추정 기록).
--   읽는 곳: app/r/[token]/route.ts(service_role, 서버 렌더만). 쓰는 곳: 같은 라우트(report_views INSERT) ·
--   scripts/report-pages.mjs(게시·회수). 절차: ops/report-pages.md.
-- 최소 수집: report_views 는 token · viewed_at · kind(bot|browser) 세 칸뿐이다. IP·이메일·UA 칸을 만들지 않는다.
--   10분 중복 합산은 저장 때가 아니라 읽을 때 한다(lib/report-pages/core.ts estimateViews) — 원 행을 지우지 않는다.
--   ⚠️ 열람 수는 "열람 추정"이다. A등급(직접 관측)이 아닌 추정치다(UA 분류는 위조·누락에 약하다).
-- 🟢 비파괴·멱등. 새 테이블 2개만. CREATE TABLE IF NOT EXISTS. RLS 켬·정책 0(service_role 전용, 20260915000002 관례)
--   + anon·authenticated 권한 회수(이중 잠금 — 결론서 본문이 브라우저 anon 키로 새면 안 된다).
-- 롤백: 20261103000020_report_pages_rollback.sql
-- ============================================================

-- ── 적용 전 확인 ──
--   SELECT to_regclass('public.report_pages'), to_regclass('public.report_views');   -- 기대: NULL, NULL

BEGIN;

CREATE TABLE IF NOT EXISTS public.report_pages (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  -- 32바이트 난수 base64url(43자). 회사·판별 정보를 담지 않는다. 형식은 lib/report-pages/core.ts TOKEN_RE 와 같다.
  token        text NOT NULL UNIQUE CHECK (token ~ '^[A-Za-z0-9_-]{43}$'),
  company_slug text NOT NULL CHECK (company_slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  version      integer NOT NULL CHECK (version >= 1),
  -- 신뢰 못 하는 입력으로 다룬다(라우트가 sandbox iframe 으로 격리 렌더). 상한 2MB.
  html         text NOT NULL CHECK (length(html) BETWEEN 1 AND 2000000),
  created_at   timestamptz NOT NULL DEFAULT now(),
  revoked_at   timestamptz,   -- NOT NULL 이면 즉시 404(없음과 같은 응답)
  UNIQUE (company_slug, version)
);
COMMENT ON TABLE public.report_pages IS
  '비공개 결론서 /r/{token} 본문(v71by). service_role 전용. revoked_at NOT NULL = 회수(404).';

CREATE TABLE IF NOT EXISTS public.report_views (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  token     text NOT NULL REFERENCES public.report_pages(token) ON DELETE CASCADE,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  kind      text NOT NULL CHECK (kind IN ('bot', 'browser'))
);
COMMENT ON TABLE public.report_views IS
  '결론서 열람 기록(v71by) — 열람 추정, A등급 아닌 추정치. token·viewed_at·kind 만(IP·이메일·UA 저장 금지). 집계는 browser 만, 같은 토큰 10분 내 1회.';
CREATE INDEX IF NOT EXISTS report_views_token_viewed_at_idx ON public.report_views (token, viewed_at);

ALTER TABLE public.report_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_views ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.report_pages FROM anon, authenticated;
REVOKE ALL ON public.report_views FROM anon, authenticated;

-- 저장 칸 고정: report_views 에 이 세 칸 + id 말고는 없어야 한다(IP·이메일·UA 가 끼면 실패).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'report_views'
      AND column_name NOT IN ('id', 'token', 'viewed_at', 'kind')
  ) THEN
    RAISE EXCEPTION 'report_views 에 허용 밖 칸이 있다';
  END IF;
END $$;

COMMIT;

-- ── 적용 후 확인 ──
-- 양성(존재·RLS): SELECT relname, relrowsecurity FROM pg_class WHERE oid IN ('public.report_pages'::regclass, 'public.report_views'::regclass);  -- 기대: 2행, t t
-- 양성(정책 0): SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename IN ('report_pages','report_views');  -- 기대: 0
-- 양성(칸): SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='report_views' ORDER BY ordinal_position;  -- 기대: id, token, viewed_at, kind
-- 음성(롤백되는 형태 — 형식 틀린 토큰): BEGIN; INSERT INTO public.report_pages (token, company_slug, version, html) VALUES ('short', 'test', 1, '<p>x</p>'); ROLLBACK;  -- 기대: CHECK 위반
-- 음성(롤백되는 형태 — kind 밖 값): BEGIN; INSERT INTO public.report_pages (token, company_slug, version, html) VALUES (repeat('Z',43), 'selftest-fake', 1, '<p>가짜</p>'); INSERT INTO public.report_views (token, kind) VALUES (repeat('Z',43), 'human'); ROLLBACK;  -- 기대: 두 번째 INSERT CHECK 위반
-- 음성(anon 권한): SELECT has_table_privilege('anon', 'public.report_pages', 'SELECT');  -- 기대: f
