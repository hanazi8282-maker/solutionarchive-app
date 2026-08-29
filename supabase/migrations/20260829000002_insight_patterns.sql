-- ============================================================
-- 인사이트 패턴 레지스트리 + 나이틀리 루프 실행 로그
--
-- 20260829000001_saved_examples.sql 다음에 실행한다(FK 의존).
--
-- ── 왜 hypotheses 와 별도 테이블인가 ────────────────────────
--   가설(hypotheses)은 "실험"의 단위다. 패턴(insight_patterns)은 "가이드에
--   반영되는 문장"의 단위다. 둘은 수명이 다르다:
--
--     패턴은 저장 글 1건에서 후보로 태어나고, 근거가 쌓이면 가이드에 반영되고,
--     성과가 나쁘면 가이드에서 회수(rollback)된다. 이 반영/회수 상태는
--     실험 상태(testing/supported/rejected)와 다른 축이다.
--
--   같은 테이블에 두면 "실험은 끝났지만 아직 가이드에 남아있는" 상태나
--   "가이드에서 뺐지만 실험은 계속 도는" 상태를 표현할 수 없다. 그 둘이
--   실제로 자주 생긴다 — 기각 판정 직후 커밋이 실패하면 정확히 그 상태다.
--
-- ── 자동 커밋을 되돌릴 수 있게 하는 것이 이 테이블의 존재 이유다 ──
--   이 파이프라인은 사람 승인 없이 main 에 push 하는 유일한 경로다.
--   무엇이 언제 왜 가이드에 들어갔고 어떤 커밋으로 들어갔는지가 행으로
--   남지 않으면, 나중에 "이 문장 왜 여기 있지"를 사람이 git log 를 뒤져
--   추적해야 한다. reflected_commit_sha 가 그 추적을 한 줄로 만든다.
--
-- 가역: 동명 rollback 파일 참조.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- 1) insight_patterns — 가이드에 반영되는 패턴 1건 = 1행
--
--    pattern_key 가 안정적 식별자다. LLM 이 매번 다른 제목을 뽑아도
--    같은 패턴이면 같은 key 로 수렴해야 근거가 누적된다. key 를 LLM 에게
--    자유 생성시키지 않고 짧은 slug 규칙을 강제하는 이유다(코드에서 정규화).
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.insight_patterns (
  id             uuid        NOT NULL DEFAULT gen_random_uuid()
                             CONSTRAINT insight_patterns_pkey PRIMARY KEY,
  pattern_key    text        NOT NULL
                             CONSTRAINT insight_patterns_pattern_key_key UNIQUE,
  title          text        NOT NULL,
  description    text        NOT NULL,
  insight_type   text,
  evidence_count integer     NOT NULL DEFAULT 1,

  -- 가이드 반영 상태. 실험 상태(hypotheses.status)와 다른 축이다.
  --   candidate  : 근거 부족. 가이드에 안 들어간다.
  --   reflected  : 가이드에 반영됨. 성과 측정 대기.
  --   confirmed  : 표본 5개 이상 + 개선 확인. 가이드에서 강조(strength 상승).
  --   rejected   : 성과 나쁨. 가이드에서 회수됨.
  status         text        NOT NULL DEFAULT 'candidate',

  -- 가이드에서의 강조 수준. 0=미반영, 1=참고, 2=권장, 3=기본값.
  -- 승격될수록 올라가고 기각되면 0 으로 떨어진다.
  strength       integer     NOT NULL DEFAULT 0,

  hypothesis_code text,

  first_seen_at        timestamptz NOT NULL DEFAULT now(),
  reflected_at         timestamptz,
  reflected_commit_sha text,
  rejected_at          timestamptz,
  rollback_reason      text,

  -- 판정 근거 스냅샷. 나중에 "왜 승격했나"를 되짚을 때 그 시점의 수치가
  -- 필요하다. post_performance 는 계속 변하므로 지금 다시 조회하면
  -- 판정 당시와 다른 값이 나온다.
  last_measured_at   timestamptz,
  last_sample_size   integer,
  last_metrics       jsonb,

  CONSTRAINT insight_patterns_status_check
    CHECK (status = ANY (ARRAY['candidate'::text, 'reflected'::text,
                               'confirmed'::text, 'rejected'::text])),
  CONSTRAINT insight_patterns_strength_check
    CHECK (strength >= 0 AND strength <= 3),
  CONSTRAINT insight_patterns_insight_type_check
    CHECK (insight_type IS NULL OR insight_type = ANY (
      ARRAY['actionable'::text, 'reframe'::text, 'transferable_frame'::text])),
  CONSTRAINT insight_patterns_hypothesis_code_fkey
    FOREIGN KEY (hypothesis_code) REFERENCES public.hypotheses(code),

  -- 반영됐다면 언제 어느 커밋으로 들어갔는지가 반드시 있어야 한다.
  -- 이게 없으면 자동 커밋을 사람이 되짚을 방법이 사라진다.
  CONSTRAINT insight_patterns_reflected_needs_trace
    CHECK (status NOT IN ('reflected', 'confirmed') OR reflected_at IS NOT NULL)
);

-- 가이드 재생성은 매 실행마다 "지금 반영돼야 할 패턴 전부"를 훑는다.
CREATE INDEX IF NOT EXISTS insight_patterns_active_idx
  ON public.insight_patterns (strength DESC, evidence_count DESC)
  WHERE status IN ('reflected', 'confirmed');

ALTER TABLE public.insight_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insight_patterns FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE public.insight_patterns IS
  '저장 글에서 추출돼 생성 가이드에 반영되는 패턴. status 는 가이드 반영 상태이고 hypotheses.status(실험 상태)와 다른 축이다.';
COMMENT ON COLUMN public.insight_patterns.pattern_key IS
  '안정적 slug. LLM 이 제목을 매번 다르게 뽑아도 같은 패턴이면 같은 key 로 수렴해야 근거가 누적된다.';
COMMENT ON COLUMN public.insight_patterns.strength IS
  '가이드 강조 수준 0~3. 0=미반영, 1=참고, 2=권장, 3=기본값. 승격 시 상승, 기각 시 0.';
COMMENT ON COLUMN public.insight_patterns.reflected_commit_sha IS
  '이 패턴을 가이드에 넣은 자동 커밋. 사람이 되짚을 때의 유일한 실마리다.';
COMMENT ON COLUMN public.insight_patterns.last_metrics IS
  '판정 시점의 지표 스냅샷. post_performance 는 계속 변하므로 나중에 재조회하면 판정 당시 값이 안 나온다.';


-- ────────────────────────────────────────────────────────────
-- 2) insight_loop_runs — 나이틀리 실행 1회 = 1행 (투명성 안전장치)
--
--    설계안 §6 의 "사람이 승인은 안 해도 오늘 뭐가 바뀌었는지는 항상 확인
--    가능하게"를 담당한다. 완전 자동 머지를 허용하는 대가로 이 로그는
--    선택이 아니라 필수다.
--
--    steps 를 jsonb 로 두는 이유: 단계가 앞으로 늘어난다(현재 7단계).
--    단계마다 컬럼을 만들면 스키마가 파이프라인 변경마다 따라 움직인다.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.insight_loop_runs (
  id           uuid        NOT NULL DEFAULT gen_random_uuid()
                           CONSTRAINT insight_loop_runs_pkey PRIMARY KEY,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  trigger      text        NOT NULL DEFAULT 'cron',
  dry_run      boolean     NOT NULL DEFAULT false,
  ok           boolean,

  ingested_count  integer NOT NULL DEFAULT 0,
  analyzed_count  integer NOT NULL DEFAULT 0,
  pattern_count   integer NOT NULL DEFAULT 0,
  promoted_count  integer NOT NULL DEFAULT 0,
  rejected_count  integer NOT NULL DEFAULT 0,

  commit_sha   text,
  steps        jsonb,
  error        text,

  CONSTRAINT insight_loop_runs_trigger_check
    CHECK (trigger = ANY (ARRAY['cron'::text, 'manual'::text]))
);

CREATE INDEX IF NOT EXISTS insight_loop_runs_started_idx
  ON public.insight_loop_runs (started_at DESC);

ALTER TABLE public.insight_loop_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insight_loop_runs FORCE ROW LEVEL SECURITY;

COMMENT ON TABLE public.insight_loop_runs IS
  '나이틀리 인사이트 루프 실행 로그. 완전 자동 커밋을 허용하는 대신 "오늘 뭐가 바뀌었는지"를 항상 확인 가능하게 하는 투명성 장치다.';
COMMENT ON COLUMN public.insight_loop_runs.dry_run IS
  'true 면 DB 쓰기와 커밋을 하지 않고 판정만 했다. 아침 수동 확인 경로가 기본으로 쓰는 모드다.';
COMMENT ON COLUMN public.insight_loop_runs.steps IS
  '단계별 결과(jsonb). 단계는 앞으로 늘어나므로 컬럼으로 고정하지 않는다.';
