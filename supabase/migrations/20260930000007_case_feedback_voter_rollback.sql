-- ============================================================
-- 20260930000007_case_feedback_voter — 롤백
--
-- 🔴 파괴적이다. 실행하면 사라진다:
--     · case_feedback.voter_hash · session_id 두 컬럼의 **값 전부**
--       (= 익명 표가 누구의 것이었나. 재생성 경로가 없다 — 원본 IP 를 어디에도
--        저장하지 않으므로 해시를 다시 만들 수 없다.)
--     · 표 자체(행)는 남는다. 지우는 것은 "같은 사람인가"를 아는 능력이다.
--       그래서 이 파일을 돌린 뒤에는 **하루 1회 제한이 과거에 대해 작동하지 않는다** —
--       이미 표를 낸 사람이 오늘 다시 낼 수 있다.
--
-- 그래서 CLAUDE.md §10.2 의 "되돌리기 어려운 삭제"(DROP COLUMN) 예외에 해당한다 —
-- **사람만 실행한다.** 세션이 자체 판단으로 돌리지 않는다.
--
-- 지우기 전에 남길 것 (없으면 이 파일을 돌리지 마라):
--   SELECT id, case_study_id, vote, user_email, voter_hash, session_id, created_at
--     FROM public.case_feedback
--    WHERE voter_hash IS NOT NULL OR session_id IS NOT NULL
--    ORDER BY created_at;
--
-- 되돌리는 순서를 지켜라: 앱이 이 컬럼을 읽으므로 **먼저 코드를 익명 이전 상태로
-- 배포한 뒤** 이 파일을 돌린다. 반대로 하면 폼이 "마이그 미적용" 을 띄우고(저장은
-- 하지 않는다 — 조용히 통과하지는 않는다) 그 사이 표가 0건이 된다.
-- ============================================================

BEGIN;

DROP INDEX IF EXISTS public.case_feedback_session_idx;
DROP INDEX IF EXISTS public.case_feedback_voter_idx;

ALTER TABLE public.case_feedback
  DROP COLUMN IF EXISTS session_id,
  DROP COLUMN IF EXISTS voter_hash;

COMMIT;

-- 확인
-- SELECT count(*) FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='case_feedback'
--    AND column_name IN ('voter_hash','session_id');    -- 기대: 0
-- SELECT count(*) FROM public.case_feedback;            -- 기대: 롤백 전과 같다(행은 안 지운다)
