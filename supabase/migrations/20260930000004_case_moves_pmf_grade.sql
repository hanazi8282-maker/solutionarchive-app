-- ============================================================
-- 20260930000004_case_moves_pmf_grade
--
-- PMF 등급축 — `case_moves` 에 컬럼 6개. "근거가 적혀 있나"(evidence_grade) 옆에
-- "그래서 얼마나 됐나 × 타인이 내일 할 수 있나"(pmf_grade)를 둔다.
--
-- 근거: reports/2026-09-23/pmf-grade-axis-design.md §3·§7 · 남헌 2026-09-23 결정
--       (S 는 사람이 채점 카드에서 직접 고른다 / T 잠정 폴백 허용 / 실패 케이스도 A 가능).
--       산식 정본은 `lib/cases/draft.ts pmfGrade`, 문서는 docs/case-study-pipeline-design.md §10.
--
-- 🟢 비파괴. ADD COLUMN IF NOT EXISTS 6개 — **전부 nullable, 기본값 없음, 백필 없음.**
--    기존 컬럼(`evidence_grade` · `fact_check_grade` · `transferability`)을 건드리지 않고
--    지우지도 않는다. 발행 게이트 CG-1/CG-2 는 그대로 사실확인 축을 본다.
--    롤백 파일 있음(`_rollback.sql`).
--    CLAUDE.md §10.2 사람 판단 예외 5개 해당 없음:
--      삭제 없음 · 기존 행 손상 없음(UPDATE·백필 0건) · 인증 경계 안 건드림(RLS ON +
--      정책 0 = service_role 전용 유지) · 새 수집 소스 아님 · 가격·브랜딩 결정 아님.
--
-- ⚠️ 미적용 — 서브에이전트가 만든 파일이다(CLAUDE.md §10.2: 서브에이전트는 판단 주체가
--    아니다). 사람 또는 대화형·역할 세션이 적용한다. 절차:
--      1) 대상이 solutionarchive `qmgrfqjfxqhxuufrnkwf` 인지 확인(Dothegy OS 아님).
--      2) information_schema 로 컬럼이 이미 있는지 확인 — PostgREST head:true 는 없는
--         테이블에도 204 를 준다(§7.1).
--      3) 이 파일 실행 → 하단 확인 쿼리(양성·음성)를 눈으로 본다.
--      4) `node --env-file=.env.local scripts/case-review.mjs regrade --dry` 로 투영을 먼저 본다.
--      5) docs/migration-exceptions.md 에 한 줄 남긴다.
--
-- 미적용 상태에서 죽는 것은 없다: `displayGrade()` 가 `pmf_grade ?? evidence_grade` 라
-- 화면은 옛 축을 그대로 보여주고, `regrade` 는 컬럼 없음(42703)을 "PMF 등급 없음"이 아니라
-- **마이그 미적용**으로 말하고 pmf 축만 건너뛴다(§7.1).
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1) S·T — 사람이 고르는 두 축 (0~3)
--
--   pmf_signal   "그래서 얼마나 됐나". **사람이 채점 카드에서 고른다**(남헌 2026-09-23).
--                코드(`suggestSignal`)는 기본값만 제안한다 — 코드는 벤치마크를 모른다
--                (NPS 76 이 높은지, 반품률 5% 가 낮은지 판정할 자료가 없다).
--   pmf_transfer "타인이 내일 할 수 있나". `transferability`(HIGH/MEDIUM/LOW) 를 0~3 으로
--                옮긴 값이고, 미판정이면 전제 문장에서 뽑은 **잠정**값이다.
--
-- 왜 smallint 이고 왜 CHECK 0~3 인가: 등급 A~D 와 같은 4단이지만 순서 비교를 해야 해서
-- 문자가 아니라 수치다. 범위를 열어 두면 화면 토글이 4 를 보내도 조용히 저장되고, 산식은
-- 그 값을 어느 분기에도 못 넣어 등급이 사라진다.
--
-- NULL 은 **미기재**다. 0 과 섞지 않는다(§7.1) — 0 은 "수치가 없어 결과 불분명"이라는
-- 판정이고, NULL 은 "아직 아무도 고르지 않았다"다.
-- ────────────────────────────────────────────────────────────
ALTER TABLE case_moves
  ADD COLUMN IF NOT EXISTS pmf_signal   smallint,
  ADD COLUMN IF NOT EXISTS pmf_transfer smallint;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_moves_pmf_signal_range') THEN
    ALTER TABLE case_moves ADD CONSTRAINT case_moves_pmf_signal_range
      CHECK (pmf_signal IS NULL OR (pmf_signal >= 0 AND pmf_signal <= 3));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_moves_pmf_transfer_range') THEN
    ALTER TABLE case_moves ADD CONSTRAINT case_moves_pmf_transfer_range
      CHECK (pmf_transfer IS NULL OR (pmf_transfer >= 0 AND pmf_transfer <= 3));
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 2) 합성 등급 + 사유 + 잠정 표시
--
--   pmf_grade        S×T 합성 결과 A/B/C/D (설계 §3-3). 화면 배지의 1순위 축이 된다.
--   pmf_grade_reason 왜 그 등급인지 한 줄. 등급만 남기면 다음 사람이 재현할 수 없다.
--   pmf_provisional  사람이 S·이식성을 확정하지 않은 등급인가. 41개 중 38개가 이식성
--                    미판정이라 이 플래그 없이는 "잠정"과 "확정"이 화면에서 같아진다.
--
-- 왜 char(1) 인가: `evidence_grade`·`fact_check_grade` 와 같은 타입·같은 CHECK 를 쓴다.
-- 세 축의 어휘가 갈리면 정렬·집계 코드가 축마다 달라진다.
-- ────────────────────────────────────────────────────────────
ALTER TABLE case_moves
  ADD COLUMN IF NOT EXISTS pmf_grade        char(1),
  ADD COLUMN IF NOT EXISTS pmf_grade_reason text,
  ADD COLUMN IF NOT EXISTS pmf_provisional  boolean;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_moves_pmf_grade_vocab') THEN
    ALTER TABLE case_moves ADD CONSTRAINT case_moves_pmf_grade_vocab
      CHECK (pmf_grade IS NULL OR pmf_grade IN ('A', 'B', 'C', 'D'));
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 3) metric_kind — 이 수치는 결과인가 투입인가
--
-- 설계가 초안에서 발견한 함정이다: "지원 앱 2→6,000개" 는 3,000배 개선이 아니라
-- **행동의 크기**다. 개선폭 산식에 그대로 넣으면 돈·설비를 많이 넣은 무브가 A 가 된다.
-- 그래서 투입 지표는 S2 가 상한이고, 그 구분은 기계가 아니라 사람이 채점 카드에서 고른다.
--
-- NULL 은 미기재다. 산식은 미기재를 'outcome' 으로 읽는다 — 41개 중 9개만 투입이라
-- 기본값이 그쪽이고, 잘못 읽으면 등급이 **올라가는** 방향이라 사람 눈에 띈다
-- (반대로 기본을 input 으로 두면 조용히 전부 S2 로 눌린다).
-- ────────────────────────────────────────────────────────────
ALTER TABLE case_moves
  ADD COLUMN IF NOT EXISTS metric_kind text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_moves_metric_kind_vocab') THEN
    ALTER TABLE case_moves ADD CONSTRAINT case_moves_metric_kind_vocab
      CHECK (metric_kind IS NULL OR metric_kind IN ('outcome', 'input'));
  END IF;
END $$;

COMMENT ON COLUMN case_moves.pmf_signal IS 'S 신호 강도 0~3. 사람이 채점 카드에서 고른다(코드는 제안만). NULL=미기재≠0';
COMMENT ON COLUMN case_moves.pmf_transfer IS 'T 이식성 0~3. transferability 우선, 미판정이면 전제 문장에서 뽑은 잠정값';
COMMENT ON COLUMN case_moves.pmf_grade IS 'PMF 등급 A~D = S×T (lib/cases/draft.ts pmfGrade). 화면 배지 1순위 축';
COMMENT ON COLUMN case_moves.pmf_grade_reason IS 'PMF 등급 판정 사유 한 줄. 등급만 남기면 재현할 수 없다';
COMMENT ON COLUMN case_moves.pmf_provisional IS 'true=사람이 S·이식성을 확정하지 않은 잠정 등급. 확정과 같게 보이면 §7.1 위반';
COMMENT ON COLUMN case_moves.metric_kind IS 'outcome=성과 지표 / input=투입 지표(S2 상한). NULL 은 outcome 으로 읽는다';

COMMIT;

-- ============================================================
-- 확인 쿼리 — 적용 후 **직접** 돌린다 (도구가 준 success 로 보고하지 않는다, §7.1)
-- ============================================================
--
-- (1) 양성: 컬럼 6개가 다 있고 전부 nullable 인가
--
-- SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_name = 'case_moves'
--    AND column_name IN ('pmf_signal','pmf_transfer','pmf_grade','pmf_grade_reason','pmf_provisional','metric_kind')
--  ORDER BY column_name;
-- 기대: 6행 · is_nullable 전부 YES · column_default 전부 NULL
--
-- (2) 양성: 기존 행이 그대로인가 (백필 0건이어야 한다)
--
-- SELECT count(*) AS 전체, count(pmf_grade) AS pmf등급있음, count(evidence_grade) AS 인사이트등급있음
--   FROM case_moves;
-- 기대: pmf등급있음 = 0 (regrade 를 돌리기 전이다) · 인사이트등급있음 = 전체
--
-- (3) 음성: CHECK 가 실제로 막는가 — 롤백되는 형태로 돌려 데이터를 남기지 않는다
--
-- BEGIN;
--   UPDATE case_moves SET pmf_signal = 4 WHERE id = (SELECT id FROM case_moves LIMIT 1);
--   -- 기대: ERROR 23514 case_moves_pmf_signal_range
-- ROLLBACK;
--
-- BEGIN;
--   UPDATE case_moves SET pmf_grade = 'E' WHERE id = (SELECT id FROM case_moves LIMIT 1);
--   -- 기대: ERROR 23514 case_moves_pmf_grade_vocab
-- ROLLBACK;
--
-- BEGIN;
--   UPDATE case_moves SET metric_kind = 'both' WHERE id = (SELECT id FROM case_moves LIMIT 1);
--   -- 기대: ERROR 23514 case_moves_metric_kind_vocab
-- ROLLBACK;
--
-- (4) 적용 뒤 첫 재채점은 반드시 --dry 로 투영만 먼저 본다:
--     node --env-file=.env.local scripts/case-review.mjs regrade --dry
--     설계 §4 손채점 예상치는 A 20 · B 11 · C 8 · D 2 다. 투영이 그와 다르면 그건
--     버그가 아니라 경계 판정 차이일 수 있다 — 산식을 표에 맞추지 말고 차이를 기록한다.
-- ============================================================
