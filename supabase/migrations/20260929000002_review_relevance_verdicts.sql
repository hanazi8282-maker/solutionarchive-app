-- 리뷰 목적 적합성 판정 캐시 (review_relevance_verdicts) — 4층 게이트의 T2
--
-- 배경: 수집한 리뷰가 이 프로젝트의 분석 목적에 맞는지 거르는 자리가 파이프라인 어디에도 없었다
--   (reports/2026-09-23/data-velocity-plan.md §2). extract 는 들어온 것을 그대로 프롬프트에 밀어
--   넣고, 리뷰 12,443건에 속성 40개가 그 결과다. 야간 배치가 표본(프로젝트당 기본 200건)을 LLM 으로
--   채점해 여기 적립하고, extract 입력 선별이 `irrelevant` 만 뺀다.
--
-- 🟢 비파괴. 신규 테이블 1개(CREATE TABLE IF NOT EXISTS)뿐이고 기존 테이블·컬럼·행은 건드리지 않는다.
--    롤백 파일 있음(`_rollback.sql` — DROP TABLE 1줄. 판정 캐시는 다시 판정하면 복원된다).
--    CLAUDE.md §10.2 의 **사람 판단 예외 5개에 해당 없음**:
--      삭제 없음 · 기존 데이터 손상 없음(백필·UPDATE 없음) · 인증 경계 안 건드림 ·
--      새 수집 소스 아님(이미 받아 둔 원문을 읽기만 한다) · 사업 방향 결정 아님.
--
-- 설계에서 갈린 것들:
--   · PK = input_id — 리뷰 1건에 판정 1개. 재판정은 UPSERT 로 덮는다.
--     project_id 를 따로 두는 것은 "이 프로젝트 것만" 조회·삭제를 인덱스 하나로 하려는 것이다
--     (analysis_inputs 조인 없이 배치가 남은 대상을 센다).
--   · verdict 3상태 text — 'relevant' / 'irrelevant' / 'unknown'. **NULL 을 쓰지 않는다.**
--     mock·파싱 실패·라벨 누락은 전부 'unknown' 이라는 **값**으로 적힌다. "판정을 못 했다"가
--     행의 부재와 구분돼야 배치가 같은 리뷰를 영원히 재시도하지 않는다(§7.1).
--   · human_verdict — 같은 3값. 있으면 verdict 를 이긴다(remedy_verdicts 와 같은 규칙).
--     사람이 'unknown' 을 고를 수도 있다 — "나도 모르겠다"는 판정이지 빈칸이 아니다.
--   · reason — 모델이 적은 한 줄. 채점표에서 사람이 판단 근거를 같이 본다.
--
-- ⚠️ irrelevant 가 원문을 지우지 않는다. extract 프롬프트에서 빼기만 한다 — 행은 그대로 남고
--    사람이 human_verdict 로 뒤집으면 다음 추출부터 다시 읽힌다.
--
-- RLS: ENABLE + FORCE, 정책 0개 = **service_role 전용** (리포 관례, 20260915000002 참조).
--   앱의 DB 접근은 전부 서버 라우트(service_role)이고, anon 키로 PostgREST 를 직접 치는 것만 막는다.
--
-- 적용: **미적용** — 서브에이전트가 만든 파일이다(CLAUDE.md §10.2: 서브에이전트는 판단 주체가 아니다).
--   사람 또는 대화형/역할 세션이 적용한다. 적용 절차:
--     1) 대상 프로젝트가 solutionarchive `qmgrfqjfxqhxuufrnkwf` 인지 확인(Dothegy OS 아님).
--     2) information_schema 로 이미 있는지 확인(PostgREST head:true 로 확인하지 않는다 — §7.1).
--     3) 이 파일 실행 → 하단 확인 쿼리(양성·음성)를 눈으로 본다.
--     4) 첫 판정은 `node --env-file=.env.local scripts/relevance-judge-auto.mjs --dry` 로 대상만 본 뒤 돌린다.
--     5) docs/migration-exceptions.md 에 한 줄 남긴다.

CREATE TABLE IF NOT EXISTS public.review_relevance_verdicts (
  input_id      uuid PRIMARY KEY REFERENCES public.analysis_inputs(id) ON DELETE CASCADE,
  project_id    uuid NOT NULL REFERENCES public.analysis_projects(id) ON DELETE CASCADE,
  -- 'unknown' 은 "판정을 돌렸는데 해석하지 못했다" 다. 무관이 아니다. 무관으로 읽는 코드가 있으면 버그다.
  verdict       text NOT NULL CHECK (verdict IN ('relevant','irrelevant','unknown')),
  -- 사람이 손으로 채점한 값. 있으면 verdict 보다 우선한다(scripts/relevance-grading-import.mjs).
  human_verdict text CHECK (human_verdict IS NULL OR human_verdict IN ('relevant','irrelevant','unknown')),
  model         text NOT NULL,
  judged_at     timestamptz NOT NULL DEFAULT now(),
  -- 사람 채점 시각. few-shot 되먹임이 "최근 채점 10건" 을 고르는 정렬 축이다.
  human_graded_at timestamptz,
  reason        text
);

-- 배치가 "이 프로젝트에서 아직 판정 없는 것" 을 세고, extract 가 제외 목록을 읽는 축.
CREATE INDEX IF NOT EXISTS idx_review_relevance_verdicts_project
  ON public.review_relevance_verdicts (project_id);
-- few-shot 은 사람 채점만 최근순으로 읽는다(대부분의 행은 human_verdict 가 NULL 이라 부분 인덱스).
CREATE INDEX IF NOT EXISTS idx_review_relevance_verdicts_human
  ON public.review_relevance_verdicts (human_graded_at DESC)
  WHERE human_verdict IS NOT NULL;

ALTER TABLE public.review_relevance_verdicts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_relevance_verdicts FORCE  ROW LEVEL SECURITY;

COMMENT ON TABLE public.review_relevance_verdicts IS
  '리뷰 목적 적합성 판정 캐시(relevant/irrelevant/unknown). unknown 은 확인 불가이지 무관이 아니다 — extract 는 unknown 을 읽는다. 정책 0개 = service_role 전용.';
COMMENT ON COLUMN public.review_relevance_verdicts.verdict IS
  'LLM 판정 3상태. mock·파싱 실패·라벨 누락은 unknown 으로 적힌다(행이 없는 것과 다르다).';
COMMENT ON COLUMN public.review_relevance_verdicts.human_verdict IS
  '사람 수기 채점. LLM 판정(verdict)보다 우선한다. 재판정이 이 값을 덮지 않는다(payload 에 없다).';

-- 확인 쿼리 (적용 후)
-- ── 양성 ────────────────────────────────────────────────────
--   select column_name, data_type, is_nullable from information_schema.columns
--    where table_schema='public' and table_name='review_relevance_verdicts' order by ordinal_position;  -- 8행
--   select relrowsecurity, relforcerowsecurity from pg_class where relname='review_relevance_verdicts'; -- true / true
--   select count(*) from pg_policies where tablename='review_relevance_verdicts';                       -- 0 (service_role 전용)
--   select count(*) from public.review_relevance_verdicts;                                              -- 0 (첫 판정 전)
-- ── 음성 (롤백되는 형태로 — 데이터를 남기지 않는다) ─────────
--   begin;
--     -- 어휘 밖 값은 거부돼야 한다 → 23514 가 나면 CHECK 가 살아 있다.
--     insert into public.review_relevance_verdicts (input_id, project_id, verdict, model)
--     select id, project_id, 'maybe', 'probe' from public.analysis_inputs limit 1;   -- 기대: ERROR 23514
--   rollback;
--   begin;
--     -- 없는 입력은 FK 로 거부돼야 한다 → 23503.
--     insert into public.review_relevance_verdicts (input_id, project_id, verdict, model)
--     values ('00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000000','relevant','probe'); -- 기대: ERROR 23503
--   rollback;
