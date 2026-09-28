-- 관련성 판정 기준 보완 메모 (relevance_criteria_feedback) — /relevance/grade 카드의 "기준 보완 메모" 칸.
--
-- 근거: 남헌 2026-09-28 "기준을 통과한 것과 무관한 것을 섞어 보며 기준이 제대로 도는지·보완할 점을 계속 피드백".
--   채점 값 자체(human_verdict·human_graded_at·human_product_informative)는 review_relevance_verdicts 에 쓴다 —
--   킬스위치 감사와 같은 데이터라 여기 중복하지 않는다. 이 테이블은 **메모가 있을 때만** 한 행 쌓인다.
--   stratum·model_verdicts 는 메모를 적은 순간의 스냅샷이다(나중에 재판정되면 층이 바뀔 수 있어서).
--
-- 🟢 비파괴. 신규 테이블 1개(CREATE TABLE IF NOT EXISTS)뿐. 기존 테이블·행은 건드리지 않는다.
--    롤백 파일 있음(`_rollback.sql` — DROP TABLE 1줄, 이 테이블의 메모만 사라진다).
--    CLAUDE.md §10.2 사람 판단 예외 5개 해당 없음: 삭제 없음 · 기존 데이터 변경 없음 · 인증 경계 무관 · 새 소스 아님 · 사업 방향 아님.
--
-- RLS: ENABLE + FORCE, 정책 0개 = service_role 전용(리포 관례, 20260915000002).
--
-- 적용: **미적용** — 서브에이전트가 만든 파일이다(CLAUDE.md §10.2). 미적용이어도 화면은 돈다 — 메모 칸만 "미적용"으로 잠긴다.
--   절차: 1) solutionarchive qmgrfqjfxqhxuufrnkwf 확인 2) information_schema 로 부재 확인 3) 실행 → 하단 확인 쿼리
--         4) docs/migration-exceptions.md 한 줄.

CREATE TABLE IF NOT EXISTS public.relevance_criteria_feedback (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 판정 행이 지워져도(원문 CASCADE) 메모는 기준 보완 재료로 남긴다.
  input_id                  uuid REFERENCES public.analysis_inputs(id) ON DELETE SET NULL,
  stratum                   text CHECK (stratum IS NULL OR stratum IN ('A','B','C','D')),
  human_verdict             text CHECK (human_verdict IS NULL OR human_verdict IN ('relevant','irrelevant','unknown')),
  human_product_informative boolean,
  model_verdicts            jsonb NOT NULL DEFAULT '{}'::jsonb,
  note                      text NOT NULL CHECK (length(btrim(note)) BETWEEN 1 AND 1000),
  created_by                text,
  created_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_relevance_criteria_feedback_created
  ON public.relevance_criteria_feedback (created_at DESC);

ALTER TABLE public.relevance_criteria_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.relevance_criteria_feedback FORCE  ROW LEVEL SECURITY;

COMMENT ON TABLE public.relevance_criteria_feedback IS
  '관련성 기준 보완 메모(/relevance/grade). 채점 값은 review_relevance_verdicts.human_* 가 정본 — 여기는 메모와 그 순간의 층·모델 판정 스냅샷. 정책 0개 = service_role 전용.';

-- 확인 쿼리 (적용 후)
-- ── 양성 ──
--   select column_name, data_type, is_nullable from information_schema.columns
--    where table_schema='public' and table_name='relevance_criteria_feedback' order by ordinal_position;  -- 9행
--   select relrowsecurity, relforcerowsecurity from pg_class where relname='relevance_criteria_feedback'; -- true / true
--   select count(*) from pg_policies where tablename='relevance_criteria_feedback';                       -- 0
-- ── 음성 (롤백되는 형태) ──
--   begin; insert into public.relevance_criteria_feedback (stratum, note) values ('E', 'x'); rollback;   -- 기대: ERROR 23514
--   begin; insert into public.relevance_criteria_feedback (note) values ('   '); rollback;               -- 기대: ERROR 23514
