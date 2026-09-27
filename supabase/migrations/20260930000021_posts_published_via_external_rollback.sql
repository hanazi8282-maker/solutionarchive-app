-- 롤백: 20260930000021_posts_published_via_external — CHECK 를 두 값으로 되돌린다.
-- ⚠️ published_via='external' 행이 남아 있으면 ADD CONSTRAINT 가 실패한다. 먼저 20260930000022 롤백(4행 삭제)을 돌린다.
ALTER TABLE public.posts
  DROP CONSTRAINT IF EXISTS posts_published_via_check;

ALTER TABLE public.posts
  ADD CONSTRAINT posts_published_via_check
    CHECK (published_via IS NULL OR published_via IN ('instant', 'manual'));

COMMENT ON COLUMN public.posts.published_via IS
  'instant = 대시보드 "그대로 발행" 버튼(사람이 누름) · manual = 사람이 Threads 앱에서 게시(매처 연결). NULL = 도입 전.';
