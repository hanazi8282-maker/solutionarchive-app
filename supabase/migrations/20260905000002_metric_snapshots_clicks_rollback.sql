-- ============================================================
-- 20260905000002_metric_snapshots_clicks — 롤백
--
-- ⚠️ 되돌리기 전에 확인할 것
--   이 컬럼은 실측 데이터를 담는다. DROP 하면 수집된 clicks 가 전부 사라지고
--   Threads API 는 과거 시점의 값을 다시 주지 않는다. 복구 불가다.
--
--   먼저 몇 건이 쌓였는지 본다:
--     SELECT count(clicks) FROM public.metric_snapshots;
--   0 이 아니면 백업부터:
--     CREATE TABLE public.metric_snapshots_clicks_backup AS
--       SELECT id, post_id, hours_since_publish, captured_at, clicks
--         FROM public.metric_snapshots
--        WHERE clicks IS NOT NULL;
--
--   그리고 `app/api/threads/collect-metrics/route.ts` 의
--   CLICKS_COLUMN_READY 를 false 로 되돌린다. 안 그러면 다음 크론이
--   없는 컬럼에 INSERT 를 시도해 6개 지표 수집까지 통째로 멈춘다.
--
-- 실행 방법 (§12-5)
--   Supabase 대시보드 SQL Editor 에서만 실행한다. ref: qmgrfqjfxqhxuufrnkwf
-- ============================================================

ALTER TABLE public.metric_snapshots
  DROP COLUMN IF EXISTS clicks;
