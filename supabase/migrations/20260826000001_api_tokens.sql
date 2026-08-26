-- ============================================================
-- 외부 API OAuth 토큰 영속화 테이블 (api_tokens)
--
-- 배경: Threads 연동의 토큰을 환경변수(.env.local / Vercel env)에 두면
--   갱신된 토큰을 되쓸 곳이 없다. Threads 장기 토큰은 60일짜리이고
--   갱신할 때마다 값이 바뀌므로, 배포 없이 값을 갱신할 수 있는 저장소가 필요하다.
--   갱신을 놓쳐 60일이 지나면 갱신 자체가 불가능해지고 수동 재인증밖에 답이 없다.
--
-- provider 단위 1행 구조: 한 서비스당 토큰 1개. UNIQUE 제약이 있어야
--   upsert(onConflict: provider)로 갱신 경로를 한 줄로 유지할 수 있다.
--   provider 값 예: 'threads'.
--
-- ⚠️ 이 테이블은 자격증명 저장소다. RLS 를 켜되 정책을 하나도 만들지 않는다.
--   그 결과 anon / authenticated 키로는 어떤 행도 읽거나 쓸 수 없고,
--   RLS 를 우회하는 service_role 키(서버 라우트·크론)만 접근한다.
--   이 앱은 NEXT_PUBLIC_SUPABASE_ANON_KEY 를 브라우저에 노출하므로,
--   정책을 하나라도 추가하면 토큰이 공개될 수 있다. 정책 추가 금지.
--
-- 가역: 동명 rollback 파일 참조(20260826000001_api_tokens_rollback.sql).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.api_tokens (
  provider      text        PRIMARY KEY,
  access_token  text        NOT NULL,
  refresh_token text,
  expires_at    timestamptz NOT NULL,
  user_id       text,
  scope         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- ── RLS: 켜되 정책 없음 = service_role 전용 ──────────────────
ALTER TABLE public.api_tokens ENABLE ROW LEVEL SECURITY;

-- FORCE 를 걸어 테이블 소유자(postgres)도 정책을 따르게 한다.
-- 대시보드 SQL 에디터는 소유자 권한으로 실행되므로, FORCE 가 없으면
-- 이 테이블이 정말 잠겼는지 대시보드에서 확인할 수 없다.
-- service_role 은 BYPASSRLS 역할이라 FORCE 와 무관하게 계속 접근한다.
ALTER TABLE public.api_tokens FORCE ROW LEVEL SECURITY;

-- ── 컬럼 의미 주석 ───────────────────────────────────────────
COMMENT ON TABLE  public.api_tokens IS
  '외부 API OAuth 토큰 저장소. provider 당 1행. RLS 정책 없음 = service_role 전용. 정책을 추가하면 자격증명이 노출된다.';
COMMENT ON COLUMN public.api_tokens.provider IS
  '서비스 식별자. 예: threads. upsert 충돌 기준 컬럼.';
COMMENT ON COLUMN public.api_tokens.access_token IS
  '현재 유효한 액세스 토큰. Threads 는 갱신 시 값이 새로 발급되므로 매 갱신마다 덮어쓴다.';
COMMENT ON COLUMN public.api_tokens.refresh_token IS
  'Threads 는 별도 refresh_token 이 없다(access_token 자체를 th_refresh_token 으로 갱신). '
  '따라서 threads 행에서는 null 로 둔다. access_token 을 복사해 넣지 않는다 — '
  '갱신 시 한쪽만 갱신되면 두 값이 어긋나고, 나중에 이 컬럼을 진짜 refresh token 으로 오인하게 된다. '
  'refresh_token 을 실제로 주는 다른 provider 를 위해 컬럼 자체는 남겨둔다.';
COMMENT ON COLUMN public.api_tokens.expires_at IS
  '만료 시각. 갱신 응답의 expires_in(초)을 now() 에 더해 계산한다. Threads 는 60일.';
COMMENT ON COLUMN public.api_tokens.user_id IS
  '토큰이 가리키는 계정 ID. Threads 는 code 교환 응답에서 access_token 과 함께 내려온다. '
  '발행 API 의 경로 파라미터로 쓰므로 토큰과 같은 행에 둬야 짝이 어긋나지 않는다.';
COMMENT ON COLUMN public.api_tokens.scope IS
  '발급 시 승인된 스코프 목록(쉼표 구분). 권한 부족으로 인한 API 실패를 진단할 때 쓴다.';
COMMENT ON COLUMN public.api_tokens.updated_at IS
  '마지막 갱신 시각. 트리거 없이 쓰기 경로에서 명시적으로 now() 를 넣는다(쓰기 경로가 콜백·갱신 2곳뿐).';
