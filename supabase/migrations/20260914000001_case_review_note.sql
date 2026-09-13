-- ============================================================
-- 20260914000001_case_review_note
--
-- 케이스 검수 화면(/cases)이 사람의 결정을 남길 자리.
--   case_moves   + review_note / reviewed_by / reviewed_at
--   case_studies + review_note          (reviewed_by / reviewed_at 은 이미 있다)
--
-- ⚠️ 미적용. 사람이 적용한다 (CLAUDE.md §10.1):
--     supabase db query --linked -f supabase/migrations/20260914000001_case_review_note.sql
--   대상: solutionarchive `qmgrfqjfxqhxuufrnkwf` (dothegy-os 아님)
--   선행: 20260906000001_case_study_pipeline.sql
--
-- 왜 필요한가
--   승인 단위는 케이스가 아니라 무브다(20260906000001 ★). 그런데 무브에는 누가·언제
--   결정했는지 남길 컬럼이 없다. CLI(case-review.mjs)는 --by 를 필수로 받으면서
--   무브 결정에는 그 값을 버린다. 반려 사유는 케이스·무브 둘 다 남길 곳이 없다 —
--   사유 없는 반려는 다음 조사가 같은 근거를 또 들고 오게 만든다.
--
-- 비파괴: ADD COLUMN IF NOT EXISTS 만. 기존 행은 전부 NULL(= 기록 없음. CLI 로
--   결정된 기존 approved/rejected 행이 여기 해당한다).
--   "rejected 면 사유 필수" 를 CHECK 로 걸지 않는다 — 사유 없이 반려된 기존 행이
--   있으면 적용 자체가 실패한다. 사유 필수는 화면 서버 액션이 건다
--   (lib/cases/review.ts checkDecisionInput).
-- ============================================================

BEGIN;

ALTER TABLE public.case_moves
  ADD COLUMN IF NOT EXISTS review_note text,
  ADD COLUMN IF NOT EXISTS reviewed_by text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

ALTER TABLE public.case_studies
  ADD COLUMN IF NOT EXISTS review_note text;

COMMENT ON COLUMN public.case_moves.review_note IS
  '사람의 승인 메모·반려 사유. 반려 사유 필수는 /cases 서버 액션이 강제한다(기존 CLI 반려 행은 NULL).';
COMMENT ON COLUMN public.case_moves.reviewed_by IS
  '무브를 승인·반려한 사람. 승인 단위가 무브라 여기 남긴다. NULL = 기록 이전 결정.';
COMMENT ON COLUMN public.case_studies.review_note IS
  '케이스 승인 메모·반려 사유.';

COMMIT;

-- ────────────────────────────────────────────────────────────
-- 확인 쿼리 (적용 후) — 양성·음성 둘 다 본다(§7.1)
-- ────────────────────────────────────────────────────────────
--
-- 양성: 컬럼 4개 존재 (기대 4행)
--   SELECT table_name, column_name, data_type FROM information_schema.columns
--    WHERE table_schema = 'public'
--      AND ((table_name = 'case_moves'   AND column_name IN ('review_note', 'reviewed_by', 'reviewed_at'))
--        OR (table_name = 'case_studies' AND column_name = 'review_note'));
--
-- 기존 데이터 무변경: 적용 전후 같은 값이어야 한다
--   SELECT review_status, count(*) FROM public.case_moves   GROUP BY 1 ORDER BY 1;
--   SELECT review_status, count(*) FROM public.case_studies GROUP BY 1 ORDER BY 1;
--
-- 음성: 타입이 맞지 않는 값은 거절 (ERROR 22007 기대, 롤백되므로 데이터 영향 없음)
--   BEGIN; UPDATE public.case_moves SET reviewed_at = 'not-a-time' WHERE false; ROLLBACK;
--   (WHERE false 라도 상수 캐스팅에서 22007 이 난다)
