-- ============================================================
-- 20261001000049_idea_pmf_runs_answers — PMF 판정(구 매칭 리포트) 사분면 자가진단: 실행 표 + 답변 표
--
-- ⛔ 미적용 — 적용은 세션 자체 판단(§10.2, 예외 5개 해당 없음: 신규 표 2개·비파괴·기존 행 불변, 롤백 파일 있음).
--    서브에이전트가 파일만 만들었다. 선행: 20261001000046(queryHash 규칙). 적용 후 docs/migration-exceptions.md 에 한 줄.
-- 정본: reports/2026-10-01/design-direction-pmf-judgment.md A4 (남헌 2026-10-01 v9).
--
-- 왜 새 표인가(A4 채택 C): analysis_aspects·pmf_assessments 에 자가진단을 섞으면 그 표를 훑는 소비자
--   (/insights·/signals·/analyze·야간 배치·remedy-judge)마다 필터를 달아야 하고 하나만 빠져도 "VOC 수요"로 둔갑한다.
--   조인 경로가 없는 별도 표라 새어 나갈 길이 없다.
-- is_self_reported: case_evidence.is_self_reported(20260906000001) 와 같은 이름·뜻. 이 두 표는 CHECK 로 true 만 허용.
-- CHECK·GENERATED 는 pmf_assessments(20260908000003)·analysis_aspects(20260816000001) 것을 복사했다.
-- RLS on · 정책 0 = service_role 전용(20260915000002 규약).
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.idea_pmf_runs (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  query_hash             text NOT NULL,                       -- idea-angles.queryHash(q, kind) 그대로
  query_text             text NOT NULL,
  kind                   text NOT NULL CHECK (kind IN ('saas','all')),
  input                  jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {core_feature, customer, price, alternative, bottleneck_override}
  input_hash             text NOT NULL,                       -- idea-pmf.inputHash(정규화 input) — 캐시 키의 절반
  bottleneck             text CHECK (bottleneck IS NULL OR bottleneck IN ('AWARENESS','TRUST','CONVERSION','RETENTION','UNIT_ECONOMICS','DISTRIBUTION','SUPPLY')),
  bottleneck_source      text CHECK (bottleneck_source IS NULL OR bottleneck_source IN ('llm','user')),
  bottleneck_confidence  text CHECK (bottleneck_confidence IS NULL OR bottleneck_confidence IN ('high','low')),
  bottleneck_reason      text,
  match_status           text CHECK (match_status IS NULL OR match_status IN ('matched','no_match','not_run')),
  match_reason           text,
  matched_case_move_ids  uuid[] NOT NULL DEFAULT '{}',
  salient                jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{factor, why, anchor_move_id}]
  questions              jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{id, factor, question, anchor_move_id}]
  precedent_axis         numeric CHECK (precedent_axis IS NULL OR (precedent_axis >= 0 AND precedent_axis <= 1)),
  demand_axis            numeric CHECK (demand_axis IS NULL OR (demand_axis >= 0 AND demand_axis <= 1)),
  is_self_reported       boolean NOT NULL DEFAULT true CHECK (is_self_reported),  -- 수요축의 출처. 이 표는 항상 true
  quadrant               text CHECK (quadrant IS NULL OR quadrant IN ('PROVEN_DEMAND','UNCHARTED_DEMAND','CROWDED_NO_DEMAND','PARK')),
  status                 text NOT NULL CHECK (status IN ('queued','running','no_match','awaiting_answers','scoring','done','failed','limited')),
  llm_calls              int NOT NULL DEFAULT 0,
  models                 text[] NOT NULL DEFAULT '{}',
  cost_usd               numeric,
  cache_read_tokens      int,
  error                  text,
  requested_by           text NOT NULL,                       -- 허용목록 이메일. 답변이 개인 텍스트라 GET 도 본인만(A7)
  created_at             timestamptz NOT NULL DEFAULT now(),
  started_at             timestamptz,
  answered_at            timestamptz,
  finished_at            timestamptz,
  CONSTRAINT idea_pmf_runs_not_run_is_empty
    CHECK (match_status IS DISTINCT FROM 'not_run' OR (demand_axis IS NULL AND precedent_axis IS NULL AND quadrant IS NULL)),
  CONSTRAINT idea_pmf_runs_quadrant_needs_axes
    CHECK (quadrant IS NULL OR (demand_axis IS NOT NULL AND precedent_axis IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idea_pmf_runs_cache_idx  ON public.idea_pmf_runs (requested_by, query_hash, input_hash, created_at DESC);
CREATE INDEX IF NOT EXISTS idea_pmf_runs_user_idx   ON public.idea_pmf_runs (requested_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idea_pmf_runs_active_idx ON public.idea_pmf_runs (status) WHERE status IN ('queued','running','scoring');
ALTER TABLE public.idea_pmf_runs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.idea_pmf_answers (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id            uuid NOT NULL REFERENCES public.idea_pmf_runs (id) ON DELETE CASCADE,
  question_id       text NOT NULL,                             -- 'q1'..'q4'
  factor            text NOT NULL,                             -- = analysis_aspects.name 의 자리
  question          text NOT NULL,
  anchor_move_id    uuid REFERENCES public.case_moves (id) ON DELETE SET NULL,
  answer_text       text CHECK (answer_text IS NULL OR length(answer_text) <= 500),  -- NULL = 건너뜀
  importance        numeric CHECK (importance IS NULL OR (importance >= 0 AND importance <= 10)),
  satisfaction      numeric CHECK (satisfaction IS NULL OR (satisfaction >= 0 AND satisfaction <= 10)),
  opportunity_score numeric GENERATED ALWAYS AS (importance + greatest(importance - satisfaction, 0)) STORED,  -- 20260816000001 과 같은 식
  evidence_quote    text,                                      -- 답변 원문 그대로 1문장(코드가 포함 여부 검증), 없으면 NULL
  notes             text,
  is_self_reported  boolean NOT NULL DEFAULT true CHECK (is_self_reported),
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT idea_pmf_answers_unique UNIQUE (run_id, question_id)
);
CREATE INDEX IF NOT EXISTS idea_pmf_answers_run_idx ON public.idea_pmf_answers (run_id);
ALTER TABLE public.idea_pmf_answers ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.idea_pmf_runs IS '/cases/report PMF 판정(자가진단) 실행 1회 = 1행. 잡 2개(질문 생성 → 답변 점수). 수요축은 창업자 답변을 AI 가 읽은 자가진단(is_self_reported=true 고정) — analysis_aspects 의 VOC 수요와 다른 표·다른 뜻. 산식은 lib/cases/match.ts 한 벌. service_role 전용. 20261001000049';
COMMENT ON TABLE public.idea_pmf_answers IS '질문 1개 = 1행. importance/satisfaction 0~10(extract-run 척도 재사용), opportunity_score 는 analysis_aspects 와 같은 GENERATED 식. answer_text 는 창업자 원문(영구 보관, 삭제·TTL 없음 — 확인 질문 1 잠정). 20261001000049';
COMMENT ON COLUMN public.idea_pmf_runs.is_self_reported IS 'case_evidence.is_self_reported(20260906000001) 와 같은 이름·뜻: 당사자가 스스로 말한 값. 이 표는 CHECK 로 true 만 허용.';
COMMENT ON COLUMN public.idea_pmf_answers.is_self_reported IS 'case_evidence.is_self_reported(20260906000001) 와 같은 이름·뜻: 당사자가 스스로 말한 값. 이 표는 CHECK 로 true 만 허용.';

COMMIT;

-- ── 적용 후 확인 (양성·음성, 음성은 전부 롤백되는 형태) ─────────────────
-- 1) 컬럼 수: idea_pmf_runs 30 · idea_pmf_answers 14
--    SELECT table_name, count(*) FROM information_schema.columns
--     WHERE table_schema = 'public' AND table_name IN ('idea_pmf_runs', 'idea_pmf_answers') GROUP BY 1;
-- 2) RLS on · 정책 0
--    SELECT c.relname, c.relrowsecurity, (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname) AS policies
--      FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace AND c.relname IN ('idea_pmf_runs', 'idea_pmf_answers');
-- 3) 음성: is_self_reported=false → 23514
--    BEGIN; INSERT INTO public.idea_pmf_runs (query_hash, query_text, kind, input_hash, status, requested_by, is_self_reported)
--      VALUES ('x', 'x', 'saas', 'x', 'queued', 'x', false); ROLLBACK;
-- 4) 음성: not_run 인데 축 값 → 23514 / quadrant 인데 demand NULL → 23514
--    BEGIN; INSERT INTO public.idea_pmf_runs (query_hash, query_text, kind, input_hash, status, requested_by, match_status, demand_axis)
--      VALUES ('x', 'x', 'saas', 'x', 'failed', 'x', 'not_run', 0); ROLLBACK;
--    BEGIN; INSERT INTO public.idea_pmf_runs (query_hash, query_text, kind, input_hash, status, requested_by, quadrant, precedent_axis)
--      VALUES ('x', 'x', 'saas', 'x', 'done', 'x', 'PARK', 0.2); ROLLBACK;
-- 5) 음성: importance 11 → 23514 / answer_text 501자 → 23514 / answers.is_self_reported=false → 23514
--    BEGIN; WITH r AS (INSERT INTO public.idea_pmf_runs (query_hash, query_text, kind, input_hash, status, requested_by)
--      VALUES ('x', 'x', 'saas', 'x', 'awaiting_answers', 'x') RETURNING id)
--      INSERT INTO public.idea_pmf_answers (run_id, question_id, factor, question, importance) SELECT id, 'q1', 'f', 'q', 11 FROM r; ROLLBACK;
--    (같은 꼴로 answer_text = repeat('가', 501) · is_self_reported = false)
-- 6) 양성: (importance 8, satisfaction 3) → opportunity_score 13, is_self_reported 기본 true
--    BEGIN; WITH r AS (INSERT INTO public.idea_pmf_runs (query_hash, query_text, kind, input_hash, status, requested_by)
--      VALUES ('x', 'x', 'saas', 'x', 'awaiting_answers', 'x') RETURNING id)
--      INSERT INTO public.idea_pmf_answers (run_id, question_id, factor, question, importance, satisfaction)
--      SELECT id, 'q1', 'f', 'q', 8, 3 FROM r RETURNING opportunity_score, is_self_reported; ROLLBACK;   -- 13 · true
