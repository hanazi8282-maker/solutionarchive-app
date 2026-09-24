-- review_relevance_verdicts 에 T2 라벨 4칸 추가 (impact · frequency · community_signal · wtp_mentioned)
--
-- 배경: reports/2026-09-24/competitor-features-reestimate.md A1 (§F 7 impact/frequency · §F 8 pain/demand/objection
--   · 12 WTP 언급). 남헌 2026-09-24 2차 결정 4번. 관련성 판정(lib/analysis/relevance-judge.ts)과 **같은 호출**에서
--   받는다 — 프롬프트·마이그·재판정을 세 번 하지 않으려고 한 번에 쌓는다. 화면은 7번(태그 2개)만.
--
-- 🟢 비파괴. nullable ADD COLUMN 4개(IF NOT EXISTS) + 허용값 CHECK 뿐이다. 기존 행·컬럼은 건드리지 않고
--    기존 780행은 NULL 로 남는다(소급 라벨은 범위 밖 — 대량 UPDATE 라 따로 판단한다). 새 판정부터만 채워진다.
--    롤백 파일 있음(`_rollback.sql` — DROP COLUMN 4줄. 잃는 것은 라벨뿐이고 재판정하면 다시 생긴다).
--    CLAUDE.md §10.2 의 **사람 판단 예외 5개에 해당 없음**:
--      삭제 없음 · 기존 데이터 손상 없음(백필·UPDATE 없음) · 인증 경계 안 건드림(RLS·정책 변경 없음) ·
--      새 수집 소스 아님 · 사업 방향 결정 아님.
--
-- 3상태(§7.1): NULL = "모델이 못 정했다" 또는 "라벨 도입 전 판정". 'mid'·false 로 접지 않는다.
--   wtp_mentioned 는 true(언급 있음) / false(없다고 답함) / NULL(모름) 세 상태다.
--
-- 코드는 적용 전에도 죽지 않는다: 배치(scripts/relevance-judge-auto.mjs)는 PGRST204/42703 이면
--   "라벨 미기록(마이그 미적용)" 경고를 남기고 verdict·reason 만 저장한다.
--
-- 적용: **미적용** — 서브에이전트가 만든 파일이다(CLAUDE.md §10.2). 대화형/역할 세션이 적용한다.
--   1) 대상이 solutionarchive `qmgrfqjfxqhxuufrnkwf` 인지 확인(Dothegy OS 아님).
--   2) 이 파일 실행 → 하단 확인 쿼리(양성·음성).
--   3) docs/migration-exceptions.md 에 한 줄 남긴다.

ALTER TABLE public.review_relevance_verdicts
  ADD COLUMN IF NOT EXISTS impact           text CHECK (impact IS NULL OR impact IN ('high','mid','low')),
  ADD COLUMN IF NOT EXISTS frequency        text CHECK (frequency IS NULL OR frequency IN ('high','mid','low')),
  ADD COLUMN IF NOT EXISTS community_signal text CHECK (community_signal IS NULL OR community_signal IN ('pain','demand','objection')),
  ADD COLUMN IF NOT EXISTS wtp_mentioned    boolean;

COMMENT ON COLUMN public.review_relevance_verdicts.impact IS
  'T2 라벨: 문제의 크기 high/mid/low. NULL = 모델이 못 정함 또는 라벨 도입 전 판정(§F 7).';
COMMENT ON COLUMN public.review_relevance_verdicts.frequency IS
  'T2 라벨: 겪는 빈도 high/mid/low. NULL = 모름(§F 7).';
COMMENT ON COLUMN public.review_relevance_verdicts.community_signal IS
  'T2 라벨: pain/demand/objection. NULL = 모름(§F 8).';
COMMENT ON COLUMN public.review_relevance_verdicts.wtp_mentioned IS
  'T2 라벨: 지불 의사 언급. true/false/NULL(모름) 3상태 — NULL 을 false 로 읽지 않는다.';

-- 확인 쿼리 (적용 후)
-- ── 양성 ────────────────────────────────────────────────────
--   select column_name, data_type, is_nullable from information_schema.columns
--    where table_schema='public' and table_name='review_relevance_verdicts'
--      and column_name in ('impact','frequency','community_signal','wtp_mentioned');   -- 4행, 전부 YES
--   select count(*) from public.review_relevance_verdicts where impact is not null;   -- 0 (다음 야간 판정 전)
-- ── 음성 (롤백되는 형태로) ──────────────────────────────────
--   begin;
--     update public.review_relevance_verdicts set impact = 'medium'
--      where input_id = (select input_id from public.review_relevance_verdicts limit 1);  -- 기대: ERROR 23514
--   rollback;
