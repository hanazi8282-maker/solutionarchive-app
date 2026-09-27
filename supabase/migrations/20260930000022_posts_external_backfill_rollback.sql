-- 롤백: 20260930000022_posts_external_backfill — 이 4행만 지운다(external_id 로 특정). 다른 external 행은 건드리지 않는다.
DELETE FROM public.posts
 WHERE published_via = 'external'
   AND external_id IN ('18109270787178013', '18097760243339156', '18379137238228689', '18088869200679739');
-- 확인: SELECT count(*) FROM public.posts WHERE external_id IN ('18109270787178013', '18097760243339156', '18379137238228689', '18088869200679739');  -- 0
