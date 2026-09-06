-- ============================================================
-- 20260906000002_posts_pending_review.sql 되돌리기
--
-- ⚠️ 순서가 중요하다. CHECK 를 먼저 좁히면 기존 pending_review 행 때문에
--    23514 로 실패한다. 행을 먼저 draft 로 내린다.
--    **내리는 순간 "게이트 통과함" 정보가 사라진다** — 그 사실은
--    post_decision_link 와 04-decisions.md 판정 로그에 남아 있으므로
--    복구는 가능하지만, 이 파일만 돌리면 posts 테이블에서는 구분이 없어진다.
-- ============================================================

BEGIN;

UPDATE public.posts
  SET status = 'draft'
  WHERE status = 'pending_review';

ALTER TABLE public.posts
  DROP CONSTRAINT IF EXISTS posts_status_check;

ALTER TABLE public.posts
  ADD CONSTRAINT posts_status_check
    CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'discarded'::text])));

COMMENT ON COLUMN public.posts.status IS NULL;

COMMIT;
