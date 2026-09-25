-- ============================================================
-- 20260930000018_posts_instant_publish
--
-- Threads "즉시발행" 트랙(남헌 2026-09-25 승인, 접근안 A) — 대시보드에서 로그인한 사람이 "그대로 발행"을 누르면
-- 서버 액션이 Threads API 로 게시하고 posts 를 매처와 같은 필드 세트로 갱신한다.
--
-- 🟢 비파괴. nullable ADD COLUMN 2개.
--   publishing_at  — 발행 선점 표시. 버튼 이중 클릭·탭 두 개에서 같은 초안을 두 번 게시하지 않게, 발행 직전에
--                    `WHERE status='pending_review' AND external_id IS NULL AND (publishing_at IS NULL OR publishing_at < now()-5min)`
--                    조건으로 한 행만 잡는다. external_id UNIQUE 는 2차 방어(같은 Threads id 두 번 저장 불가).
--   published_via  — 'instant'(대시보드 버튼) | 'manual'(사람이 앱에서 게시, 매처가 연결). NULL = 컬럼 도입 전 행.
-- 롤백: 20260930000018_posts_instant_publish_rollback.sql
-- ============================================================

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS publishing_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_via text
    CHECK (published_via IS NULL OR published_via IN ('instant', 'manual'));

COMMENT ON COLUMN public.posts.publishing_at IS '즉시발행 선점 시각. 서버 액션이 발행 직전에 찍고, 성공·실패 뒤 NULL 로 되돌린다. 5분 지나면 선점 만료.';
COMMENT ON COLUMN public.posts.published_via IS 'instant = 대시보드 "그대로 발행" 버튼(사람이 누름) · manual = 사람이 Threads 앱에서 게시(매처 연결). NULL = 도입 전.';

-- 확인 쿼리
--   SELECT column_name FROM information_schema.columns WHERE table_name='posts' AND column_name IN ('publishing_at','published_via');
