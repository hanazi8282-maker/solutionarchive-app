-- 롤백: 20260930000038_posts_pillar — 컬럼을 통째로 없앤다.
-- ⚠️ pillar 값을 채운 행이 있으면 그 값도 함께 사라진다(컬럼 자체를 DROP 하므로).
--    값을 소급 채운 뒤라면 되돌리기 전에 백업(예: SELECT id, pillar FROM public.posts
--    WHERE pillar IS NOT NULL)을 먼저 떠 두는 것을 권한다.
ALTER TABLE public.posts
  DROP CONSTRAINT IF EXISTS posts_pillar_check;

ALTER TABLE public.posts
  DROP COLUMN IF EXISTS pillar;
