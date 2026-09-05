-- ============================================================
-- 20260905000002_metric_snapshots_clicks
--
-- metric_snapshots 에 미디어 단위 clicks 컬럼을 추가한다.
--
-- 왜 필요한가
--   `lib/threads/insights.ts` 의 metric 목록이 6개로 하드코딩돼 있어
--   Threads 미디어 인사이트가 주는 clicks 를 **한 번도 요청하지 않았다.**
--   2026-09-05 실측으로 API 가 clicks 를 준다는 것을 확인했고
--   (`methodology/content/prediction-schema.md` §7-2), 보조 지표 중 유일하게
--   가용한 것이 click_rate = clicks / views 다 (§1 보조 지표표).
--
-- ⚠️ 기존 profile_clicks 에 넣지 않는다
--   profile_clicks 는 **계정 단위** 인사이트다. 미디어 단위 clicks 와 다른 값이다.
--   같은 칸에 섞으면 "프로필 클릭"이라는 이름 아래 다른 지표가 쌓이고,
--   과거 행과 이후 행을 구분할 수 없어 되돌릴 수 없다.
--   profile_clicks / follows 는 계속 NULL 로 둔다 — "측정 안 함"의 표시다.
--
-- NULL 을 허용하는 이유
--   이 컬럼이 생기기 전에 수집된 행은 clicks 를 **측정하지 않은** 것이지
--   clicks 가 0 이었던 게 아니다. DEFAULT 0 을 걸면 그 둘이 영영 구분되지 않는다.
--   (CLAUDE.md §7.1 — 확인 불가를 음성으로 접지 않는다)
--
-- 실행 방법 (§12-5)
--   CLI/MCP 로 실행하지 않는다. Supabase 대시보드 SQL Editor 에서만 실행한다.
--   프로젝트 ref: qmgrfqjfxqhxuufrnkwf
--
-- 적용 후 할 일
--   `app/api/threads/collect-metrics/route.ts` 의 CLICKS_COLUMN_READY 를
--   true 로 바꾼다. 그 전까지 수집기는 clicks 를 요청은 하되 저장하지 않는다
--   (컬럼이 없는 상태에서 payload 에 넣으면 INSERT 가 통째로 실패해
--   이미 되던 6개 지표 수집까지 멈추기 때문이다).
-- ============================================================

ALTER TABLE public.metric_snapshots
  ADD COLUMN IF NOT EXISTS clicks integer;

COMMENT ON COLUMN public.metric_snapshots.clicks IS
  '미디어 단위 클릭 수 (Threads media insights ''clicks''). 계정 단위 profile_clicks 와 다른 값. NULL = 미측정.';


-- ────────────────────────────────────────────────────────────
-- 검증 쿼리 (적용 직후 실행)
-- ────────────────────────────────────────────────────────────
-- 1) 컬럼이 생겼고 nullable 인가
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_schema = 'public'
--    AND table_name   = 'metric_snapshots'
--    AND column_name IN ('clicks', 'profile_clicks');
--   기대: clicks | integer | YES  (2행 — profile_clicks 도 그대로 있어야 한다)
--
-- 2) 기존 행이 0 이 아니라 NULL 인가 (미측정과 0 의 구분)
-- SELECT count(*) AS total,
--        count(clicks) AS clicks_measured
--   FROM public.metric_snapshots;
--   기대: clicks_measured = 0  (아직 아무것도 측정되지 않음)
