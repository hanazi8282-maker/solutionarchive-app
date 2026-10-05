-- 롤백: 20261005000004_review_sources_policy_backfill — 21행을 000001 적용 직후 상태로 되돌린다.
-- 그 상태(docs/migration-exceptions.md 2026-10-05): robots_status NULL · tos_status NULL · quote_allowed true, quote_policy 는 000003 기본값 'full'.
-- ⚠️ 000004 적용 뒤 사람이 이 21행의 같은 칸을 따로 고쳤다면 그 값도 지워진다 — 돌리기 전에 현재 값을 한 번 떠 둔다:
--    SELECT key, robots_status, tos_status, quote_policy, quote_allowed FROM public.review_sources ORDER BY key;

BEGIN;

DO $$
DECLARE n int;
BEGIN
  UPDATE public.review_sources
     SET robots_status = NULL,
         tos_status    = NULL,
         quote_policy  = 'full',
         quote_allowed = true
   WHERE key IN ('danawa', 'hackernews', 'damoang', '82cook', 'theqoo', 'todayhumor', 'bobaedream', 'tumblbug',
                 'naver_blog_post', 'brunch', 'clien', 'fmkorea', 'okky', 'velog', 'youtube', 'producthunt',
                 'disquiet', 'devto', 'inflearn', 'yozm', 'indiehackers');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 21 THEN
    RAISE EXCEPTION 'policy backfill rollback: expected exactly 21 rows, got %', n;
  END IF;
END $$;

COMMIT;

-- 확인: SELECT count(*) FROM public.review_sources WHERE robots_status IS NOT NULL AND key NOT IN ('appstore','googleplay');  -- 기대: 0
