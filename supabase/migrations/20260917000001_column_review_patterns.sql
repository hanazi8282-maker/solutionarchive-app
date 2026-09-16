-- ============================================================
-- 20260917000001_column_review_patterns
--
-- 칼럼 검수 피드백 루프의 적립 자리.
--   column_review_patterns      (신규 테이블) — review_note 배치에서 뽑은 "가이드 반영 제안"
--   content_columns.feedback_at (신규 컬럼)   — "이 칼럼의 review_note 는 이미 추출에 썼다"
--
-- ⚠️ 미적용. 사람이 적용한다 (CLAUDE.md §10.1):
--     supabase db query --linked -f supabase/migrations/20260917000001_column_review_patterns.sql
--   대상: solutionarchive `qmgrfqjfxqhxuufrnkwf` (dothegy-os 아님)
--   선행: 20260916000001_content_columns.sql
--
-- 왜 필요한가
--   남헌이 /columns 에서 남긴 반려·수정 사유(review_note)는 지금 그 행에만 남고 끝난다.
--   같은 지적이 12편 중 여러 편에서 반복돼도 다음 배치의 작가는 그걸 못 본다.
--   scripts/column-feedback.mjs 가 배치 단위로 그 사유들을 모아 패턴을 뽑고 여기 적립하면,
--   /columns 상단에서 사람이 "가이드에 반영함 / 기각"을 누른다.
--
--   ⛔ 가이드 파일(content/guides/*.md)은 **사람이 직접 고친다.** 스크립트도 이 테이블도
--      그 파일을 건드리지 않는다. status='applied' 는 "사람이 가이드에 반영했다"는 기록일 뿐
--      코드가 반영했다는 뜻이 아니다.
--
--   evidence_count 는 "배치 내 빈도"다. 칼럼은 내부 전용이라 반응률이 없다 — 여러 편에서
--   같은 지적이 나왔다는 것이 유일한 근거 강도다. 1건도 제안한다(남헌이 직접 남긴 지적은
--   1건이라도 정답이다). 강도 판단은 카드에 evidence_count·source_slugs 를 그대로 보여주고
--   사람이 한다.
--
-- 비파괴: CREATE TABLE 1개 + ADD COLUMN IF NOT EXISTS 1개. 기존 데이터 무변경.
--   feedback_at 은 NULL 허용·기본 NULL 이라 기존 content_columns 행은 전부 NULL 로 시작한다
--   (= 아직 추출에 안 썼다). column-stage.mjs 의 upsert payload 에 feedback_at 키가 없어서
--   재적재해도 SET 절에 안 들어간다 — review_status 를 보존하는 것과 같은 메커니즘이다.
--   롤백: 20260917000001_column_review_patterns_rollback.sql
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.column_review_patterns (
  id             uuid        NOT NULL DEFAULT gen_random_uuid()
                             CONSTRAINT column_review_patterns_pkey PRIMARY KEY,
  -- 수렴 키. LLM 에게 기존 key 목록을 보여주고 같으면 문자 그대로 다시 쓰게 한다
  -- (lib/insight/llm.ts normalizePatternKey 와 같은 규약). UNIQUE 가 없으면 같은 지적이
  -- 매 배치마다 새 행으로 쌓여 evidence_count 가 영영 1 에서 안 올라간다.
  pattern_key    text        NOT NULL
                             CONSTRAINT column_review_patterns_pattern_key_key UNIQUE,
  title          text        NOT NULL,
  description    text        NOT NULL,
  -- 가이드에 넣을 문장 초안. 사람이 복사해 가이드 파일에 직접 붙인다 — 코드가 안 쓴다.
  advice         text        NOT NULL,
  -- 근거가 된 칼럼 수 = source_slugs 의 길이. 스크립트가 매번 합집합으로 다시 계산한다
  -- (증가 연산이 아니라 파생값이라 같은 배치를 두 번 먹여도 값이 안 부푼다).
  evidence_count int         NOT NULL DEFAULT 1,
  source_slugs   text[]      NOT NULL,
  status         text        NOT NULL DEFAULT 'proposed',
  first_seen_at  timestamptz NOT NULL DEFAULT now(),
  decided_at     timestamptz,
  decided_by     text,
  decision_note  text,

  CONSTRAINT column_review_patterns_status_check
    CHECK (status = ANY (ARRAY['proposed'::text, 'applied'::text, 'dismissed'::text]))
);

-- /columns 상단 섹션의 조회 순서 그대로: 미결정 제안을 근거 강한 것부터.
CREATE INDEX IF NOT EXISTS column_review_patterns_status_idx
  ON public.column_review_patterns USING btree (status, evidence_count DESC);

COMMENT ON TABLE public.column_review_patterns IS
  '칼럼 검수 피드백 제안. scripts/column-feedback.mjs 가 적립하고 /columns 서버 액션(사람)이 결정한다. 가이드 파일 수정은 사람이 손으로 한다 — 코드 경로 없음.';
COMMENT ON COLUMN public.column_review_patterns.evidence_count IS
  '근거가 된 칼럼 수(= source_slugs 길이). 반응률이 아니라 배치 내 빈도다 — 칼럼은 내부 전용이라 반응 지표가 없다.';
COMMENT ON COLUMN public.column_review_patterns.status IS
  'proposed = 사람 결정 대기 / applied = 사람이 가이드에 반영함 / dismissed = 사람이 기각(다음 배치 프롬프트에 되먹여 재제안을 막는다).';

-- RLS ON + FORCE + 정책 0 = service_role(서버 액션·CLI)만 접근, anon/authenticated 는 전 행 차단.
-- 20260915000002_enable_rls_service_only.sql 과 같은 규약.
ALTER TABLE public.column_review_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.column_review_patterns FORCE ROW LEVEL SECURITY;

ALTER TABLE public.content_columns
  ADD COLUMN IF NOT EXISTS feedback_at timestamptz;

COMMENT ON COLUMN public.content_columns.feedback_at IS
  '이 칼럼의 review_note 를 패턴 추출에 쓴 시각. NULL = 아직 안 씀. 멱등성의 핵심 — 채워진 행은 다음 실행의 입력에서 빠진다.';

COMMIT;

-- ────────────────────────────────────────────────────────────
-- 확인 쿼리 (적용 후) — 양성·음성 둘 다 본다 (§7.1)
-- ────────────────────────────────────────────────────────────
--
-- AC1 양성: 테이블·컬럼이 실제로 생겼다 (기대 12행). head:true 로 존재 확인하지 않는다.
--   SELECT column_name, data_type, is_nullable FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'column_review_patterns'
--    ORDER BY ordinal_position;
--
-- AC1 양성: content_columns.feedback_at 존재 (기대 1행, is_nullable = YES)
--   SELECT column_name, data_type, is_nullable FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'content_columns' AND column_name = 'feedback_at';
--
-- AC2 기존 데이터 무변경: 적용 전후 같아야 한다. feedback_at 은 전 행 NULL 이다.
--   SELECT review_status, count(*) FROM public.content_columns GROUP BY 1 ORDER BY 1;
--   SELECT count(*) AS total, count(feedback_at) AS 이미_반영됨 FROM public.content_columns;
--   (기대: 이미_반영됨 = 0)
--
-- AC3 음성: status CHECK 가 실제로 막는가 (ERROR 23514 기대, 롤백되므로 데이터 영향 없음)
--   BEGIN;
--     INSERT INTO public.column_review_patterns (pattern_key, title, description, advice, source_slugs, status)
--     VALUES ('check-probe', 't', 'd', 'a', ARRAY['x'], 'approved');
--   ROLLBACK;
--
-- AC3 음성: pattern_key UNIQUE 가 실제로 막는가 (ERROR 23505 기대)
--   BEGIN;
--     INSERT INTO public.column_review_patterns (pattern_key, title, description, advice, source_slugs)
--     VALUES ('unique-probe', 't', 'd', 'a', ARRAY['x']);
--     INSERT INTO public.column_review_patterns (pattern_key, title, description, advice, source_slugs)
--     VALUES ('unique-probe', 't2', 'd2', 'a2', ARRAY['y']);
--   ROLLBACK;
--
-- AC4 RLS: 정책 0개 + RLS/FORCE 둘 다 켜짐 (기대: rowsecurity=t, forcerowsecurity=t, 정책 0행)
--   SELECT relrowsecurity, relforcerowsecurity FROM pg_class
--    WHERE oid = 'public.column_review_patterns'::regclass;
--   SELECT count(*) FROM pg_policies
--    WHERE schemaname = 'public' AND tablename = 'column_review_patterns';
