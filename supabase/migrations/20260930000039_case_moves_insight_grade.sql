-- ============================================================
-- 20260930000039_case_moves_insight_grade
--
-- 케이스 등급 2축 확정(남헌 2026-09-29) — 스키마에 두 축을 이름 그대로 박는다.
--   인사이트 등급  = case_moves.insight_grade   (이 파일이 추가, 산식 lib/cases/draft.ts gradeMove)
--   사실확인 등급  = case_moves.fact_check_grade (20260916000002, 산식 factCheckGrade)
--
-- 왜 필요한가 (실측, 이 PR 설계 메모):
--   · 인사이트 등급은 2026-09-16 부터 `evidence_grade` 라는 **옛 이름의 컬럼**에 들어 있었다
--     (toRows · regrade 가 gradeMove 결과를 거기에 쓴다). 이름만 보면 "근거 등급"이다.
--   · 2026-09-23 부터 화면의 "인사이트" 배지는 `pmf_grade ?? evidence_grade` 였다. pmf_grade 는
--     S×T(신호×이식성) 산식이라 공개 정의("옮길 행동·전제·근거가 다 있다")와 **다른 값**이다.
--     pmf_grade 가 채워진 106/125 무브가 인사이트 이름표 아래 PMF 등급을 보이고 있었다.
--   · 코드 쪽 교정(표시 = insight_grade ?? evidence_grade)은 같은 PR 에 있다. 이 파일은 정본 컬럼만 만든다.
--
-- 🟢 비파괴·가산. ADD COLUMN IF NOT EXISTS 1개(nullable, 기본값 없음) + CHECK 1개 + COMMENT 4개.
--    기존 컬럼(evidence_grade · pmf_grade · fact_check_grade)은 지우지도 이름을 바꾸지도 않는다 —
--    이름을 바꾸면 리더 30여 곳(스크립트 포함)이 한꺼번에 42703 으로 죽는다.
--    **백필은 이 파일에 없다** → 20260930000040_case_moves_insight_grade_backfill.sql(드라이런 기본).
--    CLAUDE.md §10.2 사람 판단 예외 해당 없음: 삭제 없음 · 기존 행 UPDATE 0건 · 인증 경계 무관 ·
--    새 수집 소스 아님 · 가격/브랜딩 아님. (RLS ON + 정책 0 = service_role 전용 유지, 새 테이블 없음)
--
-- ⚠️ 미적용 — 서브에이전트가 만든 파일이다(§10.2). 오케스트레이터가 적용한다:
--   1) 대상이 solutionarchive `qmgrfqjfxqhxuufrnkwf` 인지 확인.
--   2) information_schema 로 insight_grade 가 아직 없는지 확인(head:true 금지, §7.1).
--   3) 이 파일 실행 → 하단 확인 쿼리(양성·음성).
--   4) 000040 백필을 드라이런(기본 ROLLBACK)으로 먼저 보고 COMMIT 으로 바꿔 실행.
--   5) lib/cases/grade-display.ts INSIGHT_GRADE_COLUMN_READY 를 true 로 바꾸는 PR(한 줄).
--   6) docs/migration-exceptions.md 에 한 줄.
--
-- 미적용 상태에서 죽는 것은 없다: 코드는 플래그가 false 인 동안 insight_grade 를 SELECT·INSERT 에
-- 넣지 않고, 화면은 evidence_grade(같은 gradeMove 값)로 읽는다.
-- ============================================================

BEGIN;

ALTER TABLE case_moves
  ADD COLUMN IF NOT EXISTS insight_grade text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'case_moves_insight_grade_vocab') THEN
    ALTER TABLE case_moves ADD CONSTRAINT case_moves_insight_grade_vocab
      CHECK (insight_grade IS NULL OR insight_grade IN ('A', 'B', 'C', 'D'));
  END IF;
END $$;

-- 공개 정의(app/_pub/components/PubGradeBadge.tsx INSIGHT)와 같은 문장. 산식이 바뀌면 셋(산식·화면·이 주석)을 같이 고친다.
COMMENT ON COLUMN case_moves.insight_grade IS
  '인사이트 등급 A~D (lib/cases/draft.ts gradeMove) — 화면 배지 1순위 축(남헌 2026-09-29 2축 확정). '
  'A=옮길 행동+그 전제+뒷받침 근거가 다 있다 / B=행동은 구체적인데 전제가 비어 있다 / '
  'C=행동이 짧거나 일반론(또는 행동·전제는 있으나 사실확인 D) / D=옮길 행동이 안 적혀 있다. NULL=미기재(D 아님)';

COMMENT ON COLUMN case_moves.fact_check_grade IS
  '사실확인 등급 A~D (lib/cases/draft.ts factCheckGrade) — 그 수치를 얼마나 믿을 수 있나. 2축 중 둘째. 발행 게이트 CG-1/CG-2 가 본다';

COMMENT ON COLUMN case_moves.evidence_grade IS
  '레거시 — 2026-09-16~ 인사이트 등급(gradeMove)의 옛 이름. insight_grade 와 같은 값을 쓴다(전환기 이중 기록). '
  '리더는 insight_grade ?? evidence_grade 로 읽는다. 스크립트 리더 전환 뒤 제거 예정 — 이 컬럼만 따로 고치지 말 것';

COMMENT ON COLUMN case_moves.pmf_grade IS
  '레거시 보조축 — PMF 등급 A~D = S×T (lib/cases/draft.ts pmfGrade). 2026-09-29 부터 화면·게이트·랭킹 축이 아니다 '
  '(2축 확정: insight_grade · fact_check_grade). regrade 가 계속 계산만 한다';

COMMIT;

-- ============================================================
-- 확인 쿼리 — 적용 후 **직접** 돌린다(§7.1)
-- ============================================================
--
-- (1) 양성: 컬럼이 있고 nullable·기본값 없음
-- SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'case_moves' AND column_name = 'insight_grade';
-- 기대: 1행 · text · YES · NULL
--
-- (2) 양성: 기존 행 그대로(백필 전) — insight_grade 0건, 나머지 세 축 적용 전과 같은 수
-- SELECT count(*) 전체, count(insight_grade) 인사이트, count(evidence_grade) 레거시,
--        count(pmf_grade) pmf, count(fact_check_grade) 사실확인
--   FROM case_moves;
-- 기대(2026-09-29 실측 기준): 전체 125 · 인사이트 0 · 레거시 125 · pmf 106 · 사실확인 125
--
-- (3) 음성: CHECK 가 막는가 — 롤백되는 형태
-- BEGIN;
--   UPDATE case_moves SET insight_grade = 'E' WHERE id = (SELECT id FROM case_moves LIMIT 1);
--   -- 기대: ERROR 23514 case_moves_insight_grade_vocab
-- ROLLBACK;
--
-- (4) 주석이 들어갔나
-- SELECT a.attname, col_description(a.attrelid, a.attnum)
--   FROM pg_attribute a
--  WHERE a.attrelid = 'public.case_moves'::regclass
--    AND a.attname IN ('insight_grade','fact_check_grade','evidence_grade','pmf_grade');
-- 기대: 4행, 전부 NULL 아님
-- ============================================================
