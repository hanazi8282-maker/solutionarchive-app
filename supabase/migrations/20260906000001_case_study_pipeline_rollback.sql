-- ============================================================
-- 20260906000001_case_study_pipeline — 롤백
--
-- ⚠️ 되돌리기 전에 읽어라
--   이 3테이블은 **리서치 산출물**이 들어 있다. 웹서치와 사람 검수를 거친
--   데이터라 다시 만들려면 그 작업을 통째로 다시 해야 한다. 코드처럼
--   재생성되지 않는다.
--
--   DROP 전에 반드시 백업:
--     COPY (SELECT * FROM public.case_studies)  TO STDOUT WITH CSV HEADER;
--     COPY (SELECT * FROM public.case_moves)    TO STDOUT WITH CSV HEADER;
--     COPY (SELECT * FROM public.case_evidence) TO STDOUT WITH CSV HEADER;
--   (대시보드에서는 각 테이블 뷰의 Export CSV 를 쓴다)
--
--   행 수부터 확인하고 시작한다. 0행이 아니면 멈춰서 다시 생각하라:
--     SELECT
--       (SELECT count(*) FROM public.case_studies)  AS studies,
--       (SELECT count(*) FROM public.case_moves)    AS moves,
--       (SELECT count(*) FROM public.case_evidence) AS evidence;
--
-- 실행 방법 (§12-5)
--   CLI/MCP 로 실행하지 않는다. Supabase 대시보드 SQL Editor 에서만.
--
-- 순서 주의
--   case_evidence → case_moves → case_studies 순으로 지운다.
--   FK 가 걸려 있어 역순으로는 실패한다. (CASCADE 로 한 번에 지울 수도
--   있지만, 명시적으로 순서를 밟는 게 무엇이 지워지는지 눈에 보인다.)
-- ============================================================

DROP INDEX IF EXISTS public.case_evidence_case_idx;
DROP INDEX IF EXISTS public.case_evidence_move_idx;
DROP TABLE IF EXISTS public.case_evidence;

DROP INDEX IF EXISTS public.case_moves_usable_idx;
DROP INDEX IF EXISTS public.case_moves_case_idx;
DROP TABLE IF EXISTS public.case_moves;

DROP INDEX IF EXISTS public.case_studies_review_idx;
DROP INDEX IF EXISTS public.case_studies_bottleneck_idx;
DROP TABLE IF EXISTS public.case_studies;


-- ── 되돌린 뒤 확인 ──
-- SELECT table_name FROM information_schema.tables
--  WHERE table_schema='public'
--    AND table_name IN ('case_studies','case_moves','case_evidence');
--   기대: 0행
--
-- 그리고 scripts/case-review.mjs 는 이 테이블에 쓰므로 롤백 후에는
-- 실패한다. 그게 정상이다 — 조용히 건너뛰지 않는다.
