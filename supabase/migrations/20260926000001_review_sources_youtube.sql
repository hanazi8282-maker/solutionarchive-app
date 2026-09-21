-- VOC 수집 소스 — YouTube 댓글(Data API v3) 1행 등록
--
-- 어댑터: lib/review/adapters/youtube.ts (PR #106 feat/review-sources-expand 에서 2026-09-21 이식)
-- 실측·약관: docs/review-source-findings.md "3차 소스 실측 (2026-09-16)" · SP-026
--
-- 🟢 비파괴. INSERT + ON CONFLICT DO NOTHING. 기존 행은 안 건드린다.
--
-- ⚠️ 이 행은 **이미 DB 에 있다** — 미머지 브랜치의 20260916000003_review_sources_expand.sql 이
--    2026-09-16 에 적용됐다(review_sources.youtube created_at 2026-09-16T07:23Z). 그 파일은 main 에
--    없어서 리포만 보면 이 행의 출처가 없다. 이 파일은 그 출처를 main 에 남기는 것이고,
--    실제 적용은 DO NOTHING 으로 끝난다(현재 DB 값 enabled=true 를 여기서 바꾸지 않는다).
--
-- ⚠️ 새로 시딩되는 환경에서는 enabled=false 로 들어간다. 켜기 전에 끝내야 할 것:
--    YouTube Developer Policies III.E.4.d — 비인증 API 데이터 30일 초과 저장 금지 →
--    원문 폐기 배치(nightly purge_apply)가 실제로 켜져 있어야 한다. 파생 데이터(소구점 추출)
--    제한은 SP-026 에 남긴 사람 판단 사항이다.
--
-- ⚠️ product_ref = v:<영상ID 11자>. **댓글이 켜져 있는 영상**만 넣는다 — 댓글 꺼진 영상은
--    403 commentsDisabled 를 주고 러너가 그것을 차단으로 분류해 소스를 통째로 끈다.

INSERT INTO public.review_sources (
  key, display_name, enabled, disabled_reason, health, min_interval_ms, daily_request_cap
) VALUES
  (
    'youtube',
    'YouTube 댓글 (Data API v3)',
    false,
    '🔴 약관 제약 — Developer Policies III.E.4.d 비인증 API 데이터 30일 초과 저장 금지 + 파생 데이터 제한(SP-026). '
    '원문 폐기 배치(purge_apply)가 켜져 있어야 30일 조건을 만족한다. 켜는 판단은 사람이 한다.',
    'ok', 1000, 200
  )
ON CONFLICT (key) DO NOTHING;

-- 확인용:
--   select key, enabled, health, min_interval_ms, daily_request_cap from public.review_sources where key = 'youtube';
