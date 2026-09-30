-- ============================================================
-- 20261001000048_idea_query_log_anonymous — 매칭 리포트(/cases/report) 익명 질의도 idea_query_log 에 남긴다
--
-- ⛔ 미적용. 서브에이전트가 파일만 만들었다 — 적용은 오케스트레이터(§10.2 자체 판단: 비파괴 — NOT NULL 해제 ·
--    DEFAULT 있는 컬럼 추가 · CHECK 값 **추가**만. 기존 행·값 불변, 롤백 파일 있음). 선행: 20261001000046.
--    적용 후 `docs/migration-exceptions.md` 에 한 줄.
--
-- 남헌 2026-10-01: 로그인 여부와 무관하게 매칭 리포트에서 실행된 모든 질의를 남긴다(기존 "익명은 저장 안 함" 권고 반려).
--   - requested_by NULL = 익명. 익명 행은 질의 원문·해시·kind·시각만 — 이메일·IP·쿠키·UA·Referer 는 어느 컬럼에도 없다.
--   - source: 'angle_api'(앵글 API POST, 기존 행 전부) | 'report_view'(리포트 페이지 렌더 1회).
--     로그인 사용자가 앵글 패널을 쓰면 report_view 1행 + angle_api 1행이 따로 남는다 — 집계 때 source 로 가른다.
--   - outcome 'view' = report_view 행 전용(run 이 없다, run_id NULL).
--   - 삭제·TTL 없음(결정 b) — 익명 행도 같다.
-- ============================================================

BEGIN;

ALTER TABLE public.idea_query_log ALTER COLUMN requested_by DROP NOT NULL;

ALTER TABLE public.idea_query_log
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'angle_api'
  CONSTRAINT idea_query_log_source_check CHECK (source IN ('angle_api', 'report_view'));

-- outcome CHECK 교체: 000046 은 이름 없이 인라인으로 만들었다(자동 이름). 이름을 추측하지 않고 조회해 지운다.
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT con.conname FROM pg_constraint con
     WHERE con.conrelid = 'public.idea_query_log'::regclass AND con.contype = 'c'
       AND pg_get_constraintdef(con.oid) LIKE '%outcome%'
  LOOP
    EXECUTE format('ALTER TABLE public.idea_query_log DROP CONSTRAINT %I', c);
  END LOOP;
END $$;
ALTER TABLE public.idea_query_log ADD CONSTRAINT idea_query_log_outcome_check
  CHECK (outcome IN ('new', 'cache_hit', 'limited', 'failed', 'view'));

CREATE INDEX IF NOT EXISTS idea_query_log_source_time_idx ON public.idea_query_log (source, created_at DESC);

COMMENT ON TABLE public.idea_query_log IS
  '매칭 리포트 질의 로그(append-only, 영구 보관, 남헌 2026-10-01). source=angle_api: 앵글 API POST 1회 = 1행(캐시 히트·limited·failed 포함). source=report_view: /cases/report 가 매칭을 돌린 렌더 1회 = 1행(outcome=view). requested_by NULL = 익명(식별자 없음). 삭제·TTL 없음. service_role 전용. 20261001000046 · 20261001000048';
COMMENT ON COLUMN public.idea_query_log.requested_by IS '허용목록 로그인 사용자 이메일. NULL = 익명(또는 허용목록 밖 로그인) — 식별자를 저장하지 않는다.';
COMMENT ON COLUMN public.idea_query_log.source IS 'angle_api | report_view. 분석 때 같은 사람이 리포트 보고 앵글까지 돌리면 두 행이다 — source 로 갈라 센다.';

COMMIT;

-- ── 적용 후 확인 (양성·음성) ────────────────────────────────────
-- 1) 컬럼: requested_by is_nullable=YES · source 존재(default 'angle_api')
--    SELECT column_name, is_nullable, column_default FROM information_schema.columns
--     WHERE table_schema = 'public' AND table_name = 'idea_query_log' AND column_name IN ('requested_by', 'source');
-- 2) 제약: outcome CHECK 가 정확히 1개이고 'view' 포함 · source CHECK 1개
--    SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--     WHERE conrelid = 'public.idea_query_log'::regclass AND contype = 'c';
-- 3) 기존 행 불변: 전부 source='angle_api', requested_by NOT NULL
--    SELECT source, count(*), count(*) FILTER (WHERE requested_by IS NULL) AS anon FROM public.idea_query_log GROUP BY 1;
-- 4) 양성(롤백되는 형태): 익명 report_view 행이 들어간다
--    BEGIN; INSERT INTO public.idea_query_log (query_text, query_hash, kind, requested_by, outcome, source) VALUES ('x', 'x', 'saas', NULL, 'view', 'report_view'); ROLLBACK;
-- 5) 음성(롤백되는 형태): 어휘 밖 source·outcome 은 23514
--    BEGIN; INSERT INTO public.idea_query_log (query_text, query_hash, kind, outcome, source) VALUES ('x', 'x', 'saas', 'view', 'bogus'); ROLLBACK;
--    BEGIN; INSERT INTO public.idea_query_log (query_text, query_hash, kind, outcome, source) VALUES ('x', 'x', 'saas', 'bogus', 'report_view'); ROLLBACK;
-- 6) 운영 집계(분석용 — 같은 주제를 몇 번 물었나, 출처별로 따로):
--    SELECT source, query_hash, min(query_text) AS sample, count(*) AS asks,
--           count(*) FILTER (WHERE requested_by IS NULL) AS anon_asks, count(DISTINCT requested_by) AS signed_in_people
--      FROM public.idea_query_log GROUP BY 1, 2 ORDER BY asks DESC LIMIT 20;
