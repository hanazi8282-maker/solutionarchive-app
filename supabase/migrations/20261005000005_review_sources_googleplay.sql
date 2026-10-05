-- ============================================================
-- 20261005000005_review_sources_googleplay — Google Play 리뷰 소스 1행(남헌 결정: robots·약관 금지를 알고 켬)
--
-- ⛔ 미적용 — 서브에이전트가 파일만 만들었다(§10.1). 적용은 오케스트레이터 몫이다.
--    2026-10-06 제자리 수정(아직 어디에도 적용된 적 없는 파일이라 새 번호를 따지 않았다).
-- 선행: 20261005000001(정책 컬럼) · 20261005000003(quote_policy · tos_status 'forbids_automation'). 없으면 실패한다 — 그게 맞다.
--
-- 근거: 남헌 결정(v23 #1, 2026-10-06 확인) — robots 금지·약관 금지를 **둘 다 알고** 소유자 예외로 켠다.
--   robots(실측 사실): play.google.com/robots.txt 의 `User-agent: *` 그룹에 `Disallow: /_` 가 있다.
--         어댑터가 쓰는 batchexecute 경로 `/_/PlayStoreUi/data/batchexecute` 가 여기에 걸린다 → robots_status='disallowed'.
--         (상세 페이지 `/store/apps/details` 는 2026-09-02 허용 실측 — 어댑터는 그 경로를 쓰지 않는다.)
--   약관: Google Play 이용약관 3.3조 "자동화된 수단으로 접근 금지 + robots.txt 준수 의무"
--         (docs/strategy-principles.md SP-020, A등급 — 원문 직접 확인) → tos_status='forbids_automation', quote_policy='short_only'.
--   override='owner_2026-10-06' — 러너 소유자 robots 예외(lib/review/runner.ts OWNER_ROBOTS_OVERRIDES)의 허용 집합에 있는 값.
--         robots_status='disallowed' ∧ 이 override 일 때만 robots **금지** 판정을 통과한다.
--         robots 확인 불가(404·네트워크 실패)·5xx 는 여전히 요청하지 않는다(fail-closed, CLAUDE.md §7.1).
--   quote_allowed(deprecated, 20261005000003)는 넣지 않는다 — 기본값 그대로이고 코드는 읽지 않는다.
--
-- 우회 없음: UA 고정(러너), 쿠키·프록시·IP 회전·캡차 풀이 없음. 403·429·빈 응답·캡차면 즉시 중단·차단 기록
--   (lib/review/adapters/googleplay.ts abortOnChallenge → runner.ts isStrictBlock).
-- ⚠️ 보수적 시드: min_interval_ms 8000 · daily_request_cap 40. 타깃은 이 파일에 없다 — 행만 만든다(타깃 0 = 요청 0).
-- ⚠️ 응답 구조 픽스처는 아직 합성본이다(scripts/review-googleplay-selftest.mjs) — 첫 실수집 결과로 확인한다.
--
-- 🟢 비파괴. INSERT 1행(ON CONFLICT DO NOTHING — 재실행 안전). UPDATE·DELETE·DDL 없음. 롤백 파일 있음.
-- ============================================================

BEGIN;

INSERT INTO public.review_sources (
  key, display_name, enabled, disabled_reason, health, min_interval_ms, daily_request_cap,
  robots_status, tos_status, override, quote_policy, citation_allowed, last_test_result
) VALUES (
  'googleplay',
  'Google Play 리뷰',
  true,
  NULL,
  'ok', 8000, 40,
  'disallowed',
  'forbids_automation',
  'owner_2026-10-06',
  'short_only',
  true,
  '2026-10-06 미실행 — 남헌 결정으로 등록(robots /_ 금지·약관 3.3조 금지 인지). 러너 소유자 robots 예외 경로로 진행.'
)
ON CONFLICT (key) DO NOTHING;

COMMIT;

-- ── 적용 후 확인 ────────────────────────────────────────────────
-- 양성: SELECT key, enabled, robots_status, tos_status, override, quote_policy, citation_allowed, min_interval_ms, daily_request_cap
--         FROM public.review_sources WHERE key = 'googleplay';
--   기대: googleplay · true · disallowed · forbids_automation · owner_2026-10-06 · short_only · true · 8000 · 40
--   (ON CONFLICT 로 무시됐으면 값이 다를 수 있다 — 그때는 기존 행을 눈으로 보고 판단한다.)
-- 음성(롤백 형태): 약관 금지 소스를 full 로 못 올린다
--   BEGIN; UPDATE public.review_sources SET quote_policy = 'full' WHERE key = 'googleplay'; ROLLBACK;  -- 기대: 23514 review_sources_tos_restricts_quote_policy
-- 음성: 타깃 0(이 파일은 타깃을 만들지 않는다)
--   SELECT count(*) FROM public.review_targets WHERE source_key = 'googleplay';  -- 기대: 0
