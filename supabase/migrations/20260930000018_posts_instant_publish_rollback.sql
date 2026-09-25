-- 롤백: 20260930000018_posts_instant_publish — 컬럼 2개 제거. published_via 값은 추적용이라 잃어도 발행 사실(status·external_id)은 남는다.
ALTER TABLE public.posts
  DROP COLUMN IF EXISTS publishing_at,
  DROP COLUMN IF EXISTS published_via;
