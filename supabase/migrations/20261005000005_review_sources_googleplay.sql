-- ============================================================
-- 20261005000005_review_sources_googleplay — Google Play 리뷰 소스 1행(소유자 예외, 약관 금지 인지)
--
-- ⛔ 미적용 — 서브에이전트가 파일만 만들었다(§10.1). **적용은 오케스트레이터가 실측 1회 뒤에 한다**(남헌 v19 B).
--    실측 항목: play.google.com/robots.txt 의 `/_/PlayStoreUi/data/batchexecute` 판정, 실제 응답 구조(픽스처는 합성본).
-- 선행: 20261005000001(정책 컬럼) · 20261005000003(quote_policy · tos_status 'forbids_automation'). 없으면 실패한다 — 그게 맞다.
--
-- 근거: 남헌 v19 B(2026-10-05) — 약관 금지를 알고 소유자가 연다.
--   약관: Google Play 이용약관 3.3조 "자동화된 수단으로 접근 금지 + robots.txt 준수 의무"
--         (docs/strategy-principles.md SP-020, A등급 — 원문 직접 확인) → tos_status='forbids_automation', quote_policy='short_only'.
--   robots: 상세 페이지 `/store/apps/details` 는 2026-09-02 허용 실측, 어댑터가 쓰는 batchexecute 경로(`/_/…`)는 **미실측**
--         (ops/state/source-review-queue.md Google Play 줄) → robots_status='unverified'. 'disallowed' 로 적지 않았으므로
--         러너 소유자 robots 예외(OWNER_ROBOTS_OVERRIDE)는 이 소스에 걸리지 않는다 — robots 가 금지·확인 불가면 요청하지 않는다.
--   quote_allowed(deprecated, 20261005000003)는 넣지 않는다 — 기본값 그대로이고 코드는 읽지 않는다.
--
-- 우회 없음: UA 고정(러너), 쿠키·프록시·IP 회전·캡차 풀이 없음. 403·429·빈 응답·캡차면 즉시 중단·차단 기록
--   (lib/review/adapters/googleplay.ts abortOnChallenge → runner.ts isStrictBlock).
-- ⚠️ 보수적 시드: min_interval_ms 8000 · daily_request_cap 40. 타깃은 이 파일에 없다 — 행만 만든다(타깃 0 = 요청 0).
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
  'unverified',
  'forbids_automation',
  'owner_2026-10-05',
  'short_only',
  true,
  '2026-10-05 미실행 — 등록만. 셀프테스트는 합성 픽스처 기준(scripts/review-googleplay-selftest.mjs).'
)
ON CONFLICT (key) DO NOTHING;

COMMIT;

-- ── 적용 후 확인 ────────────────────────────────────────────────
-- 양성: SELECT key, enabled, robots_status, tos_status, override, quote_policy, citation_allowed, min_interval_ms, daily_request_cap
--         FROM public.review_sources WHERE key = 'googleplay';
--   기대: googleplay · true · unverified · forbids_automation · owner_2026-10-05 · short_only · true · 8000 · 40
--   (ON CONFLICT 로 무시됐으면 값이 다를 수 있다 — 그때는 기존 행을 눈으로 보고 판단한다.)
-- 음성(롤백 형태): 약관 금지 소스를 full 로 못 올린다
--   BEGIN; UPDATE public.review_sources SET quote_policy = 'full' WHERE key = 'googleplay'; ROLLBACK;  -- 기대: 23514 review_sources_tos_restricts_quote_policy
-- 음성: 타깃 0(이 파일은 타깃을 만들지 않는다)
--   SELECT count(*) FROM public.review_targets WHERE source_key = 'googleplay';  -- 기대: 0
