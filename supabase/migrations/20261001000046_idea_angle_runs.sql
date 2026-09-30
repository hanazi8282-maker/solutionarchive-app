-- ============================================================
-- 20261001000046_idea_angle_runs — `/cases/report` 앵글 검증(옵션 B, I4) 실행 행 + 질의 로그
--
-- ⛔ 미적용. 서브에이전트가 파일만 만들었다 — 적용은 오케스트레이터(§10.2 자체 판단: 신규 테이블 2개 · 비파괴 ·
--    롤백 파일 있음 · 사람 판단 예외 5개에 걸리지 않는다). 적용 후 `docs/migration-exceptions.md` 에 한 줄.
--
-- idea_angle_runs  — 앵글 생성·판정 1회 = 1행(queued→running→done|failed|limited). 7일 캐시·상한 count 의 원장.
--                    query_text 는 원문 그대로 남는다(I4-4, 남헌 2026-10-01 확정 2).
-- idea_query_log   — 앵글 API POST 1회 = 1행(append-only, 영구 보관 — 남헌 확정 2). 캐시 히트는 run 행을 새로
--                    만들지 않으므로 "같은 주제를 몇 명이 물었나"는 이 표로 센다. 삭제·TTL·자동 정리 없음.
-- 둘 다 RLS on + 정책 0 = service_role 전용(브라우저 anon 키로 못 읽는다, CLAUDE.md §5-1).
-- 범위: 로그인후 앵글 API 로 들어온 요청만. 익명 `/cases/report?q=` 질의는 여기 쓰지 않는다.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.idea_angle_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_hash        text NOT NULL,                 -- sha256(lower·공백축약(q) || '|' || kind)
  query_text        text NOT NULL,
  kind              text NOT NULL CHECK (kind IN ('saas', 'all')),
  status            text NOT NULL CHECK (status IN ('queued', 'running', 'done', 'failed', 'limited')),
  angles            jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{angle_type, headline, headline_before, verdict, reason, evidence_quote, evidence_ref, anchor, rewritten, models[]}]
  llm_calls         int NOT NULL DEFAULT 0,        -- JSON 재요청·실패한 호출 포함 실제 CLI 호출 수
  models            text[] NOT NULL DEFAULT '{}',  -- 호출 순 실제 모델(claude-cli 봉투의 model)
  cost_usd          numeric,                       -- 봉투 total_cost_usd 합(API 환산 명목값, 구독이라 청구 아님)
  cache_read_tokens int,                           -- 봉투 usage.cache_read_input_tokens 합
  matched_case_ids  uuid[] NOT NULL DEFAULT '{}',
  error             text,
  requested_by      text NOT NULL,                 -- 허용목록 이메일
  created_at        timestamptz NOT NULL DEFAULT now(),
  started_at        timestamptz,
  finished_at       timestamptz
);
CREATE INDEX IF NOT EXISTS idea_angle_runs_hash_idx   ON public.idea_angle_runs (query_hash, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idea_angle_runs_user_idx   ON public.idea_angle_runs (requested_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idea_angle_runs_active_idx ON public.idea_angle_runs (status) WHERE status IN ('queued', 'running');
ALTER TABLE public.idea_angle_runs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.idea_query_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_text   text NOT NULL,
  query_hash   text NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('saas', 'all')),
  requested_by text NOT NULL,
  run_id       uuid REFERENCES public.idea_angle_runs (id) ON DELETE SET NULL,
  outcome      text NOT NULL CHECK (outcome IN ('new', 'cache_hit', 'limited', 'failed')),
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idea_query_log_hash_idx ON public.idea_query_log (query_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idea_query_log_time_idx ON public.idea_query_log (created_at DESC);
ALTER TABLE public.idea_query_log ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.idea_angle_runs IS
  '/cases/report 앵글 검증(옵션 B) 실행 1회 = 1행. 7일 캐시·상한(사용자 10/일·동시 1·전역 동시 2) 원장. service_role 전용. 20261001000046';
COMMENT ON TABLE public.idea_query_log IS
  '앵글 API POST 1회 = 1행(append-only, 영구 보관, 남헌 2026-10-01). 캐시 히트·limited·failed 포함. 삭제·TTL 없음. service_role 전용. 20261001000046';

COMMIT;

-- ── 적용 후 확인 (양성·음성) ────────────────────────────────────
-- 1) 존재·RLS: 두 행, relrowsecurity=true, 정책 0
--    SELECT c.relname, c.relrowsecurity, (SELECT count(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
--      FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relname IN ('idea_angle_runs', 'idea_query_log');
-- 2) 컬럼(information_schema 로 — PostgREST head:true 는 없는 테이블에도 204):
--    SELECT table_name, count(*) FROM information_schema.columns
--     WHERE table_schema = 'public' AND table_name IN ('idea_angle_runs', 'idea_query_log') GROUP BY 1;   -- 16 · 8
-- 3) 음성(롤백되는 형태): 어휘 밖 status·outcome 은 거절돼야 한다
--    BEGIN; INSERT INTO public.idea_angle_runs (query_hash, query_text, kind, status, requested_by) VALUES ('x', 'x', 'saas', 'bogus', 'x'); ROLLBACK;  -- 23514
--    BEGIN; INSERT INTO public.idea_query_log (query_text, query_hash, kind, requested_by, outcome) VALUES ('x', 'x', 'saas', 'x', 'bogus'); ROLLBACK;  -- 23514
-- 4) 운영 집계(분석용 — 같은 주제를 몇 명이 물었나):
--    SELECT query_hash, min(query_text) AS sample, count(*) AS asks, count(DISTINCT requested_by) AS people
--      FROM public.idea_query_log GROUP BY 1 ORDER BY asks DESC LIMIT 20;
