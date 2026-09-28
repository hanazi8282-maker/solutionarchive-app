-- VOC 수집 소스 — Product Hunt 런칭 댓글(GraphQL API v2) 1행 등록 (비활성)
--
-- 어댑터: lib/review/adapters/producthunt.ts · 실측 프로브: scripts/voc-probe-producthunt.mjs
--
-- 🟢 비파괴. INSERT + ON CONFLICT DO NOTHING. 기존 행은 안 건드린다. DDL 없음.
--
-- ⛔ enabled=false 로 넣는다. PH API 문서가 "must not be used for commercial purposes" 라고 적는다 —
--    상업 이용 허가(hello@producthunt.com) 또는 남헌 판단 전까지 켜지 않는다(2026-09-28 CEO-STAFF).
--    켜는 것은 CLAUDE.md §10.2 "새로운 법적 리스크" 예외 = 사람 판단이다.
--
-- ⚠️ product_ref = post:<런칭 슬러그>. 토큰은 GitHub Secret PRODUCT_HUNT_API_TOKEN(헤더로만 전달).
-- ⚠️ 켜기 전에 실토큰으로 1회 실측할 것 — 댓글 `order: NEWEST` 인자는 아직 실제 스키마에 대고 돌려 보지 않았다.
-- ⚠️ min_interval_ms 2000 · daily_request_cap 100 — PH 공정 사용(복잡도 기반 시간당 상한) 여유분.

INSERT INTO public.review_sources (
  key, display_name, enabled, disabled_reason, health, min_interval_ms, daily_request_cap
) VALUES
  (
    'producthunt',
    'Product Hunt',
    false,
    'PH API 문서: "must not be used for commercial purposes" — 상업 이용 허가(hello@producthunt.com) 또는 남헌 판단 전까지 비활성 (2026-09-28 CEO-STAFF)',
    'ok', 2000, 100
  )
ON CONFLICT (key) DO NOTHING;

-- 확인용:
--   select key, display_name, enabled, disabled_reason, min_interval_ms, daily_request_cap
--     from public.review_sources where key = 'producthunt';
