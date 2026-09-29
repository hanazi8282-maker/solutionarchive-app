-- ============================================================
-- 20260930000040_case_moves_insight_grade_backfill
--
-- insight_grade(000039) 를 채운다. **기본은 드라이런이다** — 맨 끝이 ROLLBACK 이라 그대로
-- 실행하면 아무것도 남지 않고 미리보기 숫자만 나온다. 실제 반영은 마지막 줄을 COMMIT 으로
-- 바꿔 한 번 더 실행한다.
--
-- 정본은 무엇인가 — 등급을 지어내지 않는다:
--   인사이트 등급의 산식은 lib/cases/draft.ts gradeMove 하나이고, 그 결과를 2026-09-16 부터
--   `evidence_grade` 에 써 온 경로는 둘뿐이다(case-review.mjs commit → toRows, regrade).
--   그래서 이 백필은 **evidence_grade 를 그대로 복사**한다. pmf_grade(S×T)는 다른 산식이라
--   절대 쓰지 않는다.
--
-- ⚠️ 선행 확인(필수): 복사 전에 evidence_grade 가 지금 산식과 같은지 본다.
--     node --env-file=.env.local scripts/case-review.mjs regrade --dry
--   출력의 "인사이트 등급 바뀐 것 N개" 가 0 이면 그대로 복사한다. 0 이 아니면 그 N개는
--   저장값이 옛 산식이다 — 먼저 사람이 `regrade`(dry 아님)로 재채점하고 이 파일을 돌린다.
--   (또는 이 파일 대신: 000039 적용 + INSIGHT_GRADE_COLUMN_READY=true 배포 뒤 `regrade` 를 돌리면
--    regrade 가 gradeMove 재계산값으로 insight_grade 를 직접 채운다. 같은 결과, 느린 길.)
--
-- 🟡 §10.2 예외 2(백필)에 해당하는 UPDATE 다. 다만 새 컬럼의 NULL 칸만 채우고 기존 컬럼은
--    읽기만 한다 — 기존 값이 깨질 경로가 없다. 되돌리기는 아래 롤백 파일(새 컬럼만 NULL 로).
--    9/24 대량 UPDATE 4조건: 드라이런(이 파일 기본) · 롤백(_rollback) · 무중단(행 125개, 단일 문장) · Notion 기록.
-- ============================================================

BEGIN;

-- (1) 미리보기 — 무엇을 몇 개 채우나 (등급별)
SELECT evidence_grade AS 채울_값, count(*) AS 무브수
  FROM case_moves
 WHERE insight_grade IS NULL AND evidence_grade IS NOT NULL
 GROUP BY evidence_grade
 ORDER BY evidence_grade;

-- (2) 채우지 않는 행 — evidence_grade 도 NULL 이면 지어내지 않고 NULL(미기재)로 둔다
SELECT count(*) AS 원본없음_미기재로_남김
  FROM case_moves
 WHERE insight_grade IS NULL AND evidence_grade IS NULL;

-- (3) 백필
UPDATE case_moves
   SET insight_grade = evidence_grade
 WHERE insight_grade IS NULL
   AND evidence_grade IS NOT NULL;

-- (4) 검증 — 불일치 0 이어야 한다
SELECT count(*) AS 전체,
       count(insight_grade) AS 인사이트_채움,
       count(*) FILTER (WHERE insight_grade IS DISTINCT FROM evidence_grade) AS 불일치
  FROM case_moves;
-- 기대(2026-09-29 실측 기준): 전체 125 · 인사이트_채움 125 · 불일치 0

-- (5) 표시 축이 바뀌는 무브 수 — 이 PR 전 화면(pmf_grade ?? evidence_grade)과 후(insight_grade)가 다른 것.
--     "등급이 변했다"가 아니라 "옛 화면이 인사이트 이름표 아래 PMF 를 보여 줬다"의 크기다.
SELECT count(*) FILTER (WHERE pmf_grade IS NOT NULL AND pmf_grade <> insight_grade) AS 배지_바뀌는_무브,
       count(*) FILTER (WHERE pmf_grade IS NOT NULL AND pmf_grade = insight_grade)  AS 배지_같은_무브,
       count(*) FILTER (WHERE pmf_grade IS NULL)                                  AS 원래_폴백이던_무브
  FROM case_moves;

ROLLBACK;  -- ← 드라이런. 실제 반영은 이 줄을 COMMIT; 으로 바꿔 다시 실행한다.
